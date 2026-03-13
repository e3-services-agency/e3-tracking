import { toSnakeCase, toPascalCase } from '@/src/lib/utils';

export function formatPropertyName(name: string, namingMode: string): string {
  if (!name.trim()) {
    return name;
  }

  if (namingMode === 'snake_case') {
    return toSnakeCase(name);
  }

  if (namingMode === 'Title Case') {
    return toPascalCase(name).replace(/([A-Z])/g, ' $1').trim();
  }

  if (namingMode === 'camelCase') {
    return toPascalCase(name).replace(/^./, (str) => str.toLowerCase());
  }

  if (namingMode === 'PascalCase') {
    return toPascalCase(name);
  }

  if (namingMode === 'Sentence case') {
    const spaced = name.replace(/[-_]+/g, ' ').trim();
    return (
      spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase()
    );
  }

  return name;
}

