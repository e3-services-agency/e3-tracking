export function parseValueConstraints(
  valueConstraints: string,
): string | string[] {
  const constraintsArray = valueConstraints
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (constraintsArray.length > 1) {
    return constraintsArray;
  }

  return valueConstraints;
}

