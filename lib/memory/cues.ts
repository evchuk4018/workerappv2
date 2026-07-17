const STRONG_MEMORY_CUE = /\b(?:remember|forget|forgot|from now on|always|never|keep in mind|don't remember|do not remember)\b/i;

export function hasStrongMemoryCue(message: string): boolean {
  return STRONG_MEMORY_CUE.test(message);
}

export function isExplicitForgetCue(message: string): boolean {
  return /\b(?:forget|forgot|don't remember|do not remember|erase|remove)\b/i.test(message);
}

