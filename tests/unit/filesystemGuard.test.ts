import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { checkPath } from '../setup/filesystemGuard.ts';

describe('filesystemGuard', () => {
    it('blocks deletion of package.json', () => {
        expect(() => {
            checkPath('package.json');
        }).toThrow(/Blocked destructive test filesystem operation against protected project file/);
    });

    it('blocks deletion of src folder', () => {
        expect(() => {
            checkPath('src/components');
        }).toThrow(/Blocked destructive test filesystem operation against protected project file/);
    });

    it('allows deletion inside OS temp directory', () => {
        const tmpFolder = os.tmpdir();
        const safePath = path.join(tmpFolder, 'dummy-test-file-system-guard.txt');
        
        fs.writeFileSync(safePath, 'test content');
        
        expect(() => {
            fs.unlinkSync(safePath);
        }).not.toThrow();
        
        expect(fs.existsSync(safePath)).toBe(false);
    });
});
