type VehicleDraft = {
  name?: string;
  type?: string;
  cc?: number;
  hours?: number;
  km?: number;
  description?: string;
  parts?: string;
};

const types = [
  [/\benduro\b/i, 'Enduro'], [/\b(?:motocross|cross)\b/i, 'Motocross'],
  [/\bquad\b/i, 'Quad'], [/\b(?:moto de route|routière)\b/i, 'Moto de route'],
] as const;
const number = '(\\d+(?:[.,]\\d+|[ \\u00a0\\u202f]\\d{3})*)';

export function parseVehicleNotes(notes: string): VehicleDraft {
  const text = notes.trim();
  const draft: VehicleDraft = {};
  const numberFields = [
    ['cc', new RegExp(number + '\\s*(?:cm[³3]|cc|cubes?)(?![\\p{L}\\d])|cylindrée\\s*[:=]\\s*' + number, 'iu')],
    ['hours', new RegExp(number + '\\s*(?:heures?|h)(?:\\s*moteur)?\\b|heures?(?:\\s*moteur)?\\s*[:=]\\s*' + number, 'i')],
    ['km', new RegExp(number + '\\s*(?:km|kilomètres?)\\b|kilométrage\\s*[:=]\\s*' + number, 'i')],
  ] as const;
  let endOfModel = text.length;
  for (const [field, regex] of numberFields) {
    const matched = regex.exec(text);
    if (!matched) continue;
    const value = Number((matched[1] ?? matched[2] ?? '').replace(/\s/g, '').replace(',', '.'));
    if (Number.isFinite(value) && (field !== 'cc' || (Number.isInteger(value) && value > 0))) draft[field] = field === 'km' ? Math.round(value) : value;
    endOfModel = Math.min(endOfModel, matched.index);
  }
  const parts = /(?:\b(?:pièces|équipement)\s*[:=]|\bavec)\s*([^\n;]+)/i.exec(text);
  const description = /(?:^|[\n;,])\s*description\s*[:=]\s*([^\n;]+)/i.exec(text);
  if (parts?.[1]) { draft.parts = parts[1].trim().slice(0, 1200); endOfModel = Math.min(endOfModel, parts.index); }
  if (description?.[1]) { draft.description = description[1].trim().slice(0, 1200); endOfModel = Math.min(endOfModel, description.index); }
  for (const [pattern, label] of types) {
    const match = pattern.exec(text);
    if (!match) continue;
    draft.type = label;
    if (match.index > 0) endOfModel = Math.min(endOfModel, match.index);
    break;
  }
  const explicit = /(?:^|[\n;,])\s*(?:modèle|marque et modèle)\s*[:=]\s*([^\n;,]+)/i.exec(text)?.[1];
  const name = (explicit ?? text.slice(0, endOfModel).split(/[\n;,]/)[0] ?? '')
    .replace(/^(?:j['’]ai\s+(?:une?|la|le)\s+|c['’]est\s+(?:une?|la|le)\s+|ma\s+moto\s+est\s+)/i, '')
    .replace(/\s+(?:avec|de|en)\s*$/i, '').trim();
  if (name) draft.name = (name.charAt(0).toUpperCase() + name.slice(1)).slice(0, 80);
  return draft;
}
