const vscode = require('vscode');
const path = require('path');

function parseTreeStructure(content) {
  const lines = content.split('\n').filter(line => line.trim());
  const result = [];
  const pathStack = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Find the actual content (filename/dirname) by removing tree chars
    const contentMatch = line.match(/[^├└│─\s]+.*$/);
    if (!contentMatch) continue;
    
    let name = contentMatch[0].trim();
    const isDirectory = name.endsWith('/');
    if (isDirectory) {
      name = name.slice(0, -1);
    }
    
    // Calculate depth by looking at the position of the content
    const contentStart = line.indexOf(contentMatch[0]);
    const depth = Math.floor(contentStart / 4);
    
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

async function createStructure(basePath, items) {
  // Sort by depth to ensure parent directories are created first
  items.sort((a, b) => a.depth - b.depth);
  
  for (const item of items) {
    const fullPath = path.join(basePath, item.fullPath);
    const uri = vscode.Uri.file(fullPath);
    
    try {
      if (item.isDirectory) {
        await vscode.workspace.fs.createDirectory(uri);
      } else {
        const emptyContent = new Uint8Array(0);
        await vscode.workspace.fs.writeFile(uri, emptyContent);
      }
    } catch (error) {
      // Continue with next item if there's an error
    }
  }
}

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('extension.buildTreeFromFileUri', async (uri) => {
      if (!uri || !uri.fsPath.endsWith('.txt')) {
        vscode.window.showErrorMessage('Right-click a valid .txt file.');
        return;
      }

      try {
        const content = await vscode.workspace.fs.readFile(uri);
        const textContent = Buffer.from(content).toString('utf8');
        
        const items = parseTreeStructure(textContent);
        const baseDir = path.dirname(uri.fsPath);
        await createStructure(baseDir, items);
        
        vscode.window.showInformationMessage('✅ Folder structure created!');
      } catch (err) {
        vscode.window.showErrorMessage('❌ Error: ' + err.message);
      }
    })
  );
}

function deactivate() {}

module.exports = {
  activate,
  deactivate
};