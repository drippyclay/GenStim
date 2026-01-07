import { GoogleGenAI } from "@google/genai";

export type ImageStyle = 'photo' | 'illustration' | 'cartoon';

const buildPrompt = (description: string, style: ImageStyle) => {
  let stylePrompt = "";
  switch (style) {
    case 'illustration':
      stylePrompt = "simple flat vector illustration, clean lines, minimalist, educational clipart style";
      break;
    case 'cartoon':
      stylePrompt = "cute cartoon style, bold lines, bright colors, friendly appearance";
      break;
    case 'photo':
    default:
      stylePrompt = "high-quality photorealistic image, studio lighting, clear sharp focus";
      break;
  }

  return `Generate a ${stylePrompt} of ${description}. 
  The object must be completely isolated on a solid white background (hex #FFFFFF).
  Ensure the object is centered and takes up about 80% of the frame.
  No text, no labels, no shadows, no secondary objects. 
  Transparent background behavior is simulated by using pure white.`;
};

export const generateImageFromDescription = async (description: string, style: ImageStyle = 'photo'): Promise<string | null> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = buildPrompt(description, style);
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: { parts: [{ text: prompt }] },
      config: {
        imageConfig: { aspectRatio: "1:1" }
      }
    });

    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData && part.inlineData.data) {
           return `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
        }
      }
    }
    return null;
  } catch (error) {
    console.error("Single image gen error:", error);
    return null;
  }
};

export const generateVideoFromDescription = async (description: string): Promise<string | null> => {
  const hasKey = await window.aistudio.hasSelectedApiKey();
  if (!hasKey) {
    await window.aistudio.openSelectKey();
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `A clear, high-quality video showing a person ${description} isolated on a plain white background. Simple educational video style, centered, high contrast, loopable.`;

  try {
    let operation = await ai.models.generateVideos({
      model: 'veo-3.1-fast-generate-preview',
      prompt: prompt,
      config: {
        numberOfVideos: 1,
        resolution: '720p',
        aspectRatio: '1:1'
      }
    });

    while (!operation.done) {
      await new Promise(resolve => setTimeout(resolve, 10000));
      operation = await ai.operations.getVideosOperation({ operation: operation });
    }

    const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!downloadLink) throw new Error("Video download link not found");

    const response = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
    const blob = await response.blob();
    
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error("Video generation failed:", error);
    if (error instanceof Error && error.message.includes("Requested entity was not found")) {
      await window.aistudio.openSelectKey();
    }
    return null;
  }
};

export const generateStimulusVariations = async (
  label: string, 
  style: ImageStyle = 'photo', 
  mode: 'generalization' | 'action' = 'generalization'
): Promise<Array<{imageData: string, description: string}>> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const textPrompt = mode === 'action' 
    ? `I am creating a 5-frame stop-motion animation for the action: "${label}". 
       Provide 5 sequential visual descriptions of this action in progress. 
       Frame 1: Starting pose. Frame 2-4: Mid-action poses. Frame 5: Finishing pose.
       CRITICAL: The subject (e.g. "a boy in a red shirt") must be identical in every frame. Only change their physical pose.
       Return ONLY the 5 descriptions separated by "|||".`
    : `Generate 5 distinct visual descriptions for a "${label}" to be used as flashcards for generalization training.
       CRITICAL: If the label is a person or profession (e.g., doctor, teacher, child), ensure the 5 descriptions represent a wide diversity of gender, ethnicity/skin color, age, and attire. 
       Otherwise, vary the color, shape, breed, or type of the object.
       Keep descriptions strictly visual, singular object, and short (under 10 words).
       Return ONLY the descriptions separated by "|||".`;

  let descriptions: string[] = [];
  
  try {
    const textResponse = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: textPrompt,
    });
    
    const text = textResponse.text || "";
    descriptions = text.split('|||').map(s => s.trim()).filter(s => s.length > 0);
  } catch (e) {
    console.warn("Text generation failed, falling back to basic label", e);
    descriptions = [label, label, label, label, label];
  }

  if (descriptions.length === 0) descriptions = [label];
  descriptions = descriptions.slice(0, 5);

  const imagePromises = descriptions.map(async (desc) => {
    const imgData = await generateImageFromDescription(desc, style);
    if (imgData) {
      return { imageData: imgData, description: desc };
    }
    return null;
  });

  const results = await Promise.all(imagePromises);
  return results.filter((item): item is {imageData: string, description: string} => item !== null);
};