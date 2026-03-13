import type { QAProof } from '@/src/types';

export const readFileAsContent = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) =>
      resolve((event.target?.result as string) || '');
    reader.onerror = reject;

    if (file.type.startsWith('image/')) {
      reader.readAsDataURL(file);
    } else {
      reader.readAsText(file);
    }
  });

export const buildProofFromFile = async (file: File): Promise<QAProof> => {
  const content = await readFileAsContent(file);

  return {
    id: `proof-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: file.name || `proof-${Date.now()}`,
    type:
      file.type.startsWith('image/')
        ? 'image'
        : file.name.toLowerCase().endsWith('.json')
          ? 'json'
          : 'text',
    content,
    createdAt: new Date().toISOString(),
  };
};

