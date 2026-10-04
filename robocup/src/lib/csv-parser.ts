import Papa from 'papaparse';
import { Robot, CSVHeaderError, EmptyFileError } from './types';
import { generateId } from './utils';

export function parseRobotsFromCSV(csvText: string): Robot[] {
  if (!csvText || csvText.trim() === '') {
    throw new EmptyFileError('CSV file is empty');
  }

  const parsed = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  const headers = parsed.meta.fields || [];
  if (!headers.includes('Robot Name') || !headers.includes('Club')) {
    throw new CSVHeaderError("CSV must contain 'Robot Name' and 'Club' headers");
  }

  const robotsMap = new Map<string, Robot>();

  for (const row of parsed.data as Record<string, string>[]) {
    const name = row['Robot Name']?.trim();
    const club = row['Club']?.trim();
    const institution = row['Institution']?.trim() || null;

    if (!name || !club) continue;

    const lowerName = name.toLowerCase();
    if (!robotsMap.has(lowerName)) {
      robotsMap.set(lowerName, {
        id: generateId(),
        name,
        club,
        institution,
        status: 'active',
        eliminatedRound: null,
        wins: 0,
      });
    }
  }

  return Array.from(robotsMap.values());
}
