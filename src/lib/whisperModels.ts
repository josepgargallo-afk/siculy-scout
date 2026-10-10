// Modelos Whisper cuantizados (q8) disponibles para transcripción local. Tamaños de descarga MEDIDOS (ver docs/TRANSCRIPCION.md).
export type WhisperModel = 'tiny' | 'base' | 'small';
export const MODEL_INFO: Record<WhisperModel, { mb: number; label: string; hint: string }> = {
  tiny: { mb: 42, label: 'Tiny', hint: 'más rápido, mucho menos preciso' },
  base: { mb: 76, label: 'Base', hint: 'recomendado: equilibrio' },
  small: { mb: 241, label: 'Small', hint: 'el más preciso; lento y pesado (≈ 1,3 GB de RAM): sólo con Wi-Fi y móvil potente' },
};
