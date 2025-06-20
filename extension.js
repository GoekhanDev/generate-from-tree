const vscode = require('vscode');
const path = require('path');

function parseTreeStructure(content) {
  const lines = content.split('\n').filter(line => line.trim());
  const result = [];
  const pathStack = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Skip empty lines or lines with only tree characters
    if (!line.trim() || /^[├└│─\s]*$/.test(line)) continue;
    
    // More comprehensive regex to find the actual filename/dirname
    // This handles various tree formats and characters
    const contentMatch = line.match(/[├└│─\s]*(.+)$/);
    if (!contentMatch) continue;
    
    let name = contentMatch[1].trim();
    const isDirectory = name.endsWith('/');
    if (isDirectory) {
      name = name.slice(0, -1);
    }
    
    // Calculate depth more reliably by counting tree structure characters
    // Count the number of tree prefixes (├──, └──, │, spaces before content)
    const beforeContent = line.substring(0, line.indexOf(contentMatch[1]));
    
    // Method 1: Count tree connection characters
    const treeChars = (beforeContent.match(/[├└]/g) || []).length;
    
    // Method 2: For cases without tree chars, use indentation
    let indentDepth = 0;
    if (treeChars === 0) {
      // Count leading spaces and convert to depth (assuming 4 spaces = 1 level, but adapt)
      const leadingSpaces = beforeContent.length;
      indentDepth = Math.floor(leadingSpaces / 4);
    }
    
    // Use the more reliable method
    const depth = Math.max(treeChars, indentDepth);
    
    // Adjust path stack to current depth
    pathStack.length = depth;
    
    // Build full path
    const fullPath = pathStack.length > 0 ? pathStack.join('/') + '/' + name : name;
    
    result.push({
      name,
      fullPath,
      isDirectory,
      depth
    });
    
    // If it's a directory, add to path stack
    if (isDirectory) {
      pathStack[depth] = name;
    }
  }
  
  return result;
}

// Simple but reliable parser for tree structures
function parseTreeStructureAdvanced(content) {
  const lines = content.split('\n').filter(line => line.trim());
  const result = [];
  const pathStack = [];
  
  for (let i = 0; i < lines.length; i++) {
    const originalLine = lines[i];
    
    if (!originalLine.trim()) continue;
    
    let filename = originalLine
      .replace(/├──/g, '')
      .replace(/└──/g, '') 
      .replace(/│/g, '')
      .replace(/─/g, '')
      .trim();
    
    if (!filename) continue;
    
    const isDirectory = filename.endsWith('/');
    if (isDirectory) {
      filename = filename.slice(0, -1);
    }
    
    const beforeFilename = originalLine.substring(0, originalLine.indexOf(filename));
    const spaceCount = beforeFilename.length;
    const depth = Math.floor(spaceCount / 4);
    
    pathStack.length = depth;
    
    const fullPath = pathStack.length > 0 ? pathStack.join('/') + '/' + filename : filename;
    
    result.push({
      name: filename,
      fullPath,
      isDirectory,
      depth
    });
    
    if (isDirectory) {
      pathStack[depth] = filename;
    }
  }
  
  return result;
}

async function createStructure(basePath, items) {
  // Sort by depth to ensure parent directories are created first
  items.sort((a, b) => a.depth - b.depth);
  
  const created = new Set();
  
  for (const item of items) {
    const fullPath = path.join(basePath, item.fullPath);
    const uri = vscode.Uri.file(fullPath);
    
    // Skip if already created (handles duplicates)
    if (created.has(fullPath)) continue;
    
    try {
      if (item.isDirectory) {
        await vscode.workspace.fs.createDirectory(uri);
        console.log(`Created directory: ${item.fullPath}`);
      } else {
        // Ensure parent directory exists
        const parentDir = path.dirname(fullPath);
        const parentUri = vscode.Uri.file(parentDir);
        
        try {
          await vscode.workspace.fs.createDirectory(parentUri);
        } catch (error) {
          // Parent might already exist, continue
        }
        
        const emptyContent = new Uint8Array(0);
        await vscode.workspace.fs.writeFile(uri, emptyContent);
        console.log(`Created file: ${item.fullPath}`);
      }
      
      created.add(fullPath);
    } catch (error) {
      console.error(`Error creating ${item.fullPath}:`, error);
      // Continue with next item
    }
  }
}

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('extension.buildTreeFromFileUri', async (uri) => {
      if (!uri || !uri.fsPath.endsWith('.txt')) {
        vscode.window.showErrorMessage('Please right-click on a valid .txt file containing the tree structure.');
        return;
      }
      
      try {
        const content = await vscode.workspace.fs.readFile(uri);
        const textContent = Buffer.from(content).toString('utf8');
        
        // Try the advanced parser first, fallback to simple parser
        let items = parseTreeStructureAdvanced(textContent);
        
        // If advanced parser didn't work well, try the simple one
        if (items.length === 0) {
          items = parseTreeStructure(textContent);
        }
        
        if (items.length === 0) {
          vscode.window.showWarningMessage('No valid tree structure found in the file.');
          return;
        }
        
        console.log('Parsed structure:');
        items.forEach(item => {
          console.log(`  ${'  '.repeat(item.depth)}${item.name}${item.isDirectory ? '/' : ''} (depth: ${item.depth}, fullPath: ${item.fullPath})`);
        });
        
        const baseDir = path.dirname(uri.fsPath);
        await createStructure(baseDir, items);
        
        vscode.window.showInformationMessage(`✅ Folder structure created! (${items.length} items)`);
      } catch (err) {
        console.error('Extension error:', err);
        vscode.window.showErrorMessage('❌ Error creating structure: ' + err.message);
      }
    })
  );
}

function deactivate() {}

module.exports = {
  activate,
  deactivate
};