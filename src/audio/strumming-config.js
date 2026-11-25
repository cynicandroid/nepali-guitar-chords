export function parseStrummingPattern(strumString) {
    if (!strumString) return [];
    const cleaned = strumString.replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, '').toUpperCase();
    const strokes = [];
    for (const character of cleaned) {
        if ('DUCMSX'.includes(character)) strokes.push(character);
        else if (character === ' ') strokes.push(' ');
    }
    return strokes;
}
