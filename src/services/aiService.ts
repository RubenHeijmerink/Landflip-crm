import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export interface ListingAnalysis {
  address?: string;
  apn?: string;
  askingPrice?: number;
  lotSize?: number;
  agentName?: string;
  agentPhone?: string;
  marketValue?: number;
  arv?: number;
}

export async function analyzeListing(url: string): Promise<ListingAnalysis> {
  if (!url) return {};

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Analyze the property listing at this URL: ${url}. 
      Extract as much information as possible, specifically:
      1. Full Property Address
      2. Assessor's Parcel Number (APN)
      3. Asking Price (Listed Price) as a number
      4. Lot Size in acres as a number
      5. Listing Agent Name
      6. Listing Agent Phone Number
      7. Estimated Market Value (if mentioned)
      8. After Repair Value (ARV) or potential resale value (if mentioned)
      
      Return the data in JSON format. If a value is not found, omit it from the JSON.`,
      config: {
        tools: [{ urlContext: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            address: { type: Type.STRING, description: "Full property address" },
            apn: { type: Type.STRING, description: "Assessor's Parcel Number" },
            askingPrice: { type: Type.NUMBER, description: "The listed price of the property" },
            lotSize: { type: Type.NUMBER, description: "The size of the lot in acres" },
            agentName: { type: Type.STRING, description: "The name of the listing agent" },
            agentPhone: { type: Type.STRING, description: "The phone number of the listing agent" },
            marketValue: { type: Type.NUMBER, description: "Estimated market value" },
            arv: { type: Type.NUMBER, description: "After Repair Value or potential resale value" },
          },
        },
      },
    });

    const text = response.text;
    if (!text) return {};
    
    return JSON.parse(text) as ListingAnalysis;
  } catch (error) {
    console.error("Error analyzing listing:", error);
    return {};
  }
}
