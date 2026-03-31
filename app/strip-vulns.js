const fs = require('fs');
const path = require('path');

const targetEndpoint = process.env.CHALLENGE_MODE || process.argv[2];
if (!targetEndpoint) {
  console.log('No CHALLENGE_MODE specified, leaving app intact.');
  process.exit(0);
}

console.log(`[STRIPPER] Stripping app to ONLY contain: ${targetEndpoint}`);

const routesDir = path.join(__dirname, 'routes');
const serverJsPath = path.join(__dirname, 'server.js');

function stripFile(filePath, isServer) {
  let content = fs.readFileSync(filePath, 'utf8');
  let match;
  
  // Extract endpoints to KEEP vs DELETE
  // match[1] = method, match[2] = endpoint
  let routeRegex;
  if (isServer) {
    routeRegex = /(?:router|app)\.(get|post|put|delete|patch|all)\(['"`](.*?)['"`]\s*,/g;
  } else {
    routeRegex = /(?:router|app)\.(get|post|put|delete|patch|all)\(['"`](.*?)['"`]\s*,/g;
  }
  
  const routes = [];
  while ((match = routeRegex.exec(content)) !== null) {
    const endpoint = match[2];
    const startIndex = match.index;
    
    let braceCount = 0;
    let foundFirstBrace = false;
    let endIndex = startIndex;
    
    for (let i = startIndex; i < content.length; i++) {
      if (content[i] === '{') {
        braceCount++;
        foundFirstBrace = true;
      } else if (content[i] === '}') {
        braceCount--;
      }
      
      if (foundFirstBrace && braceCount === 0) {
        let j = i + 1;
        while (j < content.length && (content[j] === ')' || content[j] === ';' || content[j] === ' ' || content[j] === '\n')) {
          if (content[j] === ';') {
            endIndex = j + 1;
            break;
          }
          j++;
          endIndex = j;
        }
        if (endIndex === startIndex) endIndex = i + 1;
        break;
      }
    }
    
    // Safety check - if we couldn't parse the end properly, fallback to original end
    if (endIndex === startIndex) {
      endIndex = content.indexOf('}', startIndex) + 1;
      // find next semicolon
      let ns = content.indexOf(';', endIndex);
      if (ns !== -1 && ns < endIndex + 5) endIndex = ns + 1;
    }
    
    routes.push({ endpoint, startIndex, endIndex });
  }

  let newContent = content;
  let hasTarget = false;

  // We want to KEEP routes that exact match targetEndpoint, OR routes that are strictly infrastructure (like '/', '/login' in server.js)
  // Since we only want to KEEP targetEndpoint for vulnerabilities, we delete everything else.
  const infrastructureRoutes = ['/', '/login', '/image', '/newsletter'];

  // Bottom up deletion so indices don't shift
  routes.sort((a,b) => b.startIndex - a.startIndex).forEach(r => {
    // Determine if we keep it
    let keep = false;
    if (r.endpoint === targetEndpoint) keep = true;
    if (isServer && infrastructureRoutes.includes(r.endpoint)) keep = true;

    if (!keep) {
      newContent = newContent.substring(0, r.startIndex) + newContent.substring(r.endIndex);
    } else {
      hasTarget = true;
    }
  });

  return { newContent: newContent.replace(/\n\s*\n\s*\n/g, '\n\n'), hasTarget };
}

// 1. Process server.js
const serverResult = stripFile(serverJsPath, true);
fs.writeFileSync(serverJsPath, serverResult.newContent);

// 2. Process route files
const files = fs.readdirSync(routesDir).filter(f => f.endsWith('.js'));
const activeRoutes = [];

files.forEach(file => {
  if (file === 'index.js') return;
  const filePath = path.join(routesDir, file);
  const result = stripFile(filePath, false);
  
  if (!result.hasTarget) {
    // This route file has ZERO useful routes, delete it completely
    fs.unlinkSync(filePath);
  } else {
    // Save stripped version
    fs.writeFileSync(filePath, result.newContent);
    activeRoutes.push(file);
  }
});

// 3. Update routes/index.js to ONLY require active route files
const indexPath = path.join(routesDir, 'index.js');
if (fs.existsSync(indexPath)) {
  let indexContent = `const express = require('express');\nconst router = express.Router();\n\n`;
  activeRoutes.forEach(routeFile => {
    const routeName = routeFile.replace('.js', '');
    indexContent += `router.use('/', require('./${routeName}'));\n`;
  });
  indexContent += `\nmodule.exports = router;\n`;
  fs.writeFileSync(indexPath, indexContent);
}

console.log(`[STRIPPER] Complete. App successfully minimized to target: ${targetEndpoint}`);
