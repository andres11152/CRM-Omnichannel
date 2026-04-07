const fs = require('fs');
const path = require('path');

const SERVICES_DIR = 'c:/Users/Andres Betancourt/Desktop/Desarrollos Personales/Reply/Proyecto/backend/src/services';
const SRC_DIR = 'c:/Users/Andres Betancourt/Desktop/Desarrollos Personales/Reply/Proyecto/backend/src';

function toPascalCase(str) {
    return str.replace(/(^\w|_\w)/g, m => m.replace('_', '').toUpperCase());
}

const files = fs.readdirSync(SERVICES_DIR);
const renameMap = {};

// 1. Identify and Rename
files.forEach(file => {
    if (file.endsWith('.ts') && !/^[A-Z]/.test(file)) {
        const oldPath = path.join(SERVICES_DIR, file);
        const newName = toPascalCase(file);
        const newPath = path.join(SERVICES_DIR, newName);
        
        if (oldPath.toLowerCase() === newPath.toLowerCase() && oldPath !== newPath) {
           // On Windows, renaming a -> A requires a middle step
           const tempPath = oldPath + '.tmp';
           fs.renameSync(oldPath, tempPath);
           fs.renameSync(tempPath, newPath);
        } else {
           fs.renameSync(oldPath, newPath);
        }
        
        renameMap[file.replace('.ts', '')] = newName.replace('.ts', '');
        console.log(`Renamed: ${file} -> ${newName}`);
    }
});

// 2. Update Imports in all src files
function updateImports(dir) {
    const items = fs.readdirSync(dir);
    items.forEach(item => {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
            updateImports(fullPath);
        } else if (item.endsWith('.ts') || item.endsWith('.tsx')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            let changed = false;
            
            for (const [oldName, newName] of Object.entries(renameMap)) {
                // Support @/services/oldName, ../services/oldName, etc.
                const regex = new RegExp(`(['"])([^'"]*/services/)${oldName}(['"])`, 'g');
                if (regex.test(content)) {
                    content = content.replace(regex, `$1$2${newName}$3`);
                    changed = true;
                }
            }
            
            if (changed) {
                fs.writeFileSync(fullPath, content);
                console.log(`Updated imports in: ${fullPath}`);
            }
        }
    });
}

updateImports(SRC_DIR);
console.log('Normalization complete.');
