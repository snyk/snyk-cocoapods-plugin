import * as path from 'path';

export function fixtureDir(dir: string): string {
  return path.join(__dirname, 'fixtures', dir);
}
