import { Match, Batch } from './types';
import { generateId } from './utils';

export function createBatches(matches: Match[], batchSize: number): Batch[] {
  const batches: Batch[] = [];
  let batchNumber = 1;
  
  if (matches.length === 0) return batches;
  
  for (let i = 0; i < matches.length; i += batchSize) {
    const chunk = matches.slice(i, i + batchSize);
    batches.push({
      id: generateId(),
      batchNumber: batchNumber++,
      matches: chunk,
      status: 'pending',
    });
  }
  
  return batches;
}
