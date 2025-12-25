import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Convert route path to display name
 * e.g., "signal-centre" -> "Signal Centre"
 * e.g., "create-account" -> "Create Account"
 */
function pathToDisplayName(routePath) {
  // Remove parent path if it exists
  const parts = routePath.split('/');
  const lastPart = parts[parts.length - 1];
  
  // Handle dynamic routes (e.g., ":gatewayId")
  if (lastPart.startsWith(':')) {
    return parts.length > 1 ? pathToDisplayName(parts[parts.length - 2]) : 'Dynamic Route';
  }
  
  // Convert kebab-case to Title Case
  return lastPart
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Extract parent path from route path
 * e.g., "analysis/signal-centre" -> "analysis"
 * e.g., "dashboard" -> null
 */
function extractParentPath(routePath) {
  const parts = routePath.split('/');
  // Remove dynamic segments (e.g., ":gatewayId")
  const staticParts = parts.filter(part => !part.startsWith(':'));
  
  if (staticParts.length > 1) {
    return staticParts[0];
  }
  return null;
}

/**
 * Extract menus from Sidebar.jsx file
 * Returns array of menu objects with route_path, display_name, parent_path
 * This extracts only the menus that are actually displayed in the sidebar
 */
export function extractMenusFromRoutes() {
  try {
    // Path to Sidebar.jsx file
    const sidebarFilePath = path.join(
      __dirname,
      '../../client/src/user/components/Sidebar.jsx'
    );

    // Read the file
    const fileContent = fs.readFileSync(sidebarFilePath, 'utf-8');

    const routes = [];
    const seen = new Set();

    // Extract top-level menus: isMenuEnabled('route-path') pattern
    // Match: isMenuEnabled('dashboard'), isMenuEnabled('deposits'), etc.
    const topLevelMenuPattern = /isMenuEnabled\(['"]([^'"]+)['"]\)/g;
    let match;

    while ((match = topLevelMenuPattern.exec(fileContent)) !== null) {
      const routePath = match[1];
      
      // Skip if already seen
      if (seen.has(routePath)) continue;
      seen.add(routePath);

      // Extract display name from the comment above or from the text span after
      // Look for comment pattern: {/* Menu Name */}
      const beforeMatch = fileContent.substring(Math.max(0, match.index - 200), match.index);
      let commentMatch = beforeMatch.match(/{\/\*\s*([^*]+)\s*\*\/}/);
      
      // If no comment, try to get from text span after the Link
      if (!commentMatch) {
        const afterMatch = fileContent.substring(match.index, match.index + 500);
        const textSpanMatch = afterMatch.match(/<span[^>]*>([^<]+)<\/span>/);
        if (textSpanMatch) {
          commentMatch = { 1: textSpanMatch[1].trim() };
        }
      }

      const displayName = commentMatch 
        ? commentMatch[1].trim().replace(/\s+/g, ' ')
        : pathToDisplayName(routePath);

      routes.push({
        route_path: routePath,
        display_name: displayName,
        parent_path: null
      });
    }

    // Extract submenus: isSubMenuEnabled('parent/child') pattern
    // Match: isSubMenuEnabled('analysis/signal-centre')
    const subMenuPattern = /isSubMenuEnabled\(['"]([^'"]+)['"]\)/g;
    
    while ((match = subMenuPattern.exec(fileContent)) !== null) {
      const routePath = match[1];
      
      // Skip if already seen
      if (seen.has(routePath)) continue;
      seen.add(routePath);

      const parentPath = extractParentPath(routePath);
      
      // Try to extract display name from text span
      const afterMatch = fileContent.substring(match.index, match.index + 300);
      const textSpanMatch = afterMatch.match(/<span[^>]*>([^<]+)<\/span>/);
      const displayName = textSpanMatch 
        ? textSpanMatch[1].trim()
        : pathToDisplayName(routePath);

      routes.push({
        route_path: routePath,
        display_name: displayName,
        parent_path: parentPath
      });
    }

    // Also extract parent menus that have submenus: hasEnabledChildren('parent')
    // Match: hasEnabledChildren('analysis'), hasEnabledChildren('trade-performance')
    // Note: trade-performance uses isMenuEnabled, so it's already captured above
    const parentMenuPattern = /hasEnabledChildren\(['"]([^'"]+)['"]\)/g;
    
    while ((match = parentMenuPattern.exec(fileContent)) !== null) {
      const parentPath = match[1];
      
      // Always add parent menu (it may not have isMenuEnabled check if it only has children)
      // Even if seen, we need to ensure it's in the list as a parent
      if (!seen.has(parentPath)) {
        seen.add(parentPath);
        
        // Try to extract display name from comment before hasEnabledChildren
        // Look backwards for comment like {/* Analysis */}
        const searchWindow = 300; // Look back up to 300 chars
        const beforeMatch = fileContent.substring(Math.max(0, match.index - searchWindow), match.index);
        
        // Find the last comment before the match - look for {/* Analysis */}
        const commentRegex = /{\/\*\s*([^*]+)\s*\*\/}/g;
        const allComments = [];
        let commentMatch;
        while ((commentMatch = commentRegex.exec(beforeMatch)) !== null) {
          allComments.push(commentMatch);
        }
        let displayNameFromComment = null;
        if (allComments.length > 0) {
          // Get the last comment (closest to the hasEnabledChildren)
          displayNameFromComment = allComments[allComments.length - 1][1].trim();
        }
        
        // If no comment found, try to get from text span that appears after
        if (!displayNameFromComment) {
          const afterMatch = fileContent.substring(match.index, match.index + 600);
          // Look for <span className="text-sm font-normal">Analysis</span>
          const textSpanMatch = afterMatch.match(/<span[^>]*>\s*([^<]+)\s*<\/span>/);
          if (textSpanMatch && textSpanMatch[1] && textSpanMatch[1].trim()) {
            displayNameFromComment = textSpanMatch[1].trim();
          }
        }
        
        const displayName = displayNameFromComment || pathToDisplayName(parentPath);
        
        routes.push({
          route_path: parentPath,
          display_name: displayName,
          parent_path: null
        });
      }
    }
    
    // Ensure all parent paths referenced by submenus exist as parent menus
    routes.forEach(route => {
      if (route.parent_path && !seen.has(route.parent_path)) {
        seen.add(route.parent_path);
        routes.push({
          route_path: route.parent_path,
          display_name: pathToDisplayName(route.parent_path),
          parent_path: null
        });
      }
    });

    // Sort: top-level routes first, then sub-routes grouped by parent
    routes.sort((a, b) => {
      if (a.parent_path === null && b.parent_path !== null) return -1;
      if (a.parent_path !== null && b.parent_path === null) return 1;
      if (a.parent_path === b.parent_path) {
        return a.route_path.localeCompare(b.route_path);
      }
      return (a.parent_path || '').localeCompare(b.parent_path || '');
    });

    return routes;
  } catch (error) {
    console.error('Error extracting menus from Sidebar:', error);
    throw new Error(`Failed to extract menus: ${error.message}`);
  }
}

/**
 * Get menu structure with parent-child relationships
 */
export function getMenuStructure(menus) {
  const menuMap = new Map();
  const topLevelMenus = [];

  // First pass: create menu objects
  menus.forEach(menu => {
    menuMap.set(menu.route_path, {
      ...menu,
      children: []
    });
  });

  // Second pass: build hierarchy
  menus.forEach(menu => {
    const menuObj = menuMap.get(menu.route_path);
    if (menu.parent_path) {
      const parent = menuMap.get(menu.parent_path);
      if (parent) {
        parent.children.push(menuObj);
      } else {
        // Parent doesn't exist, add as top-level
        topLevelMenus.push(menuObj);
      }
    } else {
      topLevelMenus.push(menuObj);
    }
  });

  return topLevelMenus;
}

