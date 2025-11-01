import { BicepResourceMapper } from './bicepResourceMapper';
import type { BicepResourceSnippet } from '@/store/iacStore';

const resourceRegex = /resource\s+([a-zA-Z0-9_]+)\s+'([^']+)'/g;

const extractBlock = (content: string, startIndex: number) => {
  let i = startIndex;
  const length = content.length;
  let braceCount = 0;
  let inString = false;
  let prevChar = '';

  while (i < length) {
    const char = content[i];
    if (char === '"' && prevChar !== '\\') {
      inString = !inString;
    }
    if (!inString) {
      if (char === '{') {
        braceCount += 1;
      } else if (char === '}') {
        braceCount -= 1;
        if (braceCount === 0) {
          return content.substring(startIndex, i + 1);
        }
      }
    }
    prevChar = char;
    i += 1;
  }
  return content.substring(startIndex);
};

const extractProperties = (body: string): string[] => {
  const props: string[] = [];
  const lines = body.split('\n');
  const propertyRegex = /^\s{2,}([a-zA-Z0-9_]+)\s*:/;
  let nestedDepth = 0;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line) continue;
    if (line.includes('{')) nestedDepth += (line.match(/{/g) || []).length;
    if (line.includes('}')) nestedDepth -= (line.match(/}/g) || []).length;

    if (nestedDepth <= 1) {
      const match = propertyRegex.exec(line);
      if (match) {
        const key = match[1];
        if (!props.includes(key)) {
          props.push(key);
        }
      }
    }
  }
  return props;
};

export const parseBicepResources = (template: string): BicepResourceSnippet[] => {
  const resources: BicepResourceSnippet[] = [];
  if (!template?.trim()) {
    return resources;
  }

  let match: RegExpExecArray | null;
  while ((match = resourceRegex.exec(template)) !== null) {
    const [, identifier, typeAndVersion] = match;
    const blockStart = template.indexOf('{', match.index);
    if (blockStart === -1) {
      continue;
    }
    const body = extractBlock(template, blockStart);

    const [resourceTypeRaw, apiVersion] = typeAndVersion.split('@');
    const resourceType = resourceTypeRaw ?? typeAndVersion;
    const decoratedType = apiVersion ? `${resourceType}@${apiVersion}` : resourceType;
    const declaration = `resource ${identifier} '${decoratedType}' = `;
    const fullText = `${declaration}${body}`;

    const mapping = BicepResourceMapper.getMapping(resourceType);
    const properties = extractProperties(body);

    resources.push({
      name: identifier,
      type: resourceType,
      apiVersion: apiVersion,
      fullText,
      body,
      properties,
      iconTitle: mapping?.iconTitle,
      serviceName: mapping?.serviceName,
    });
  }

  return resources;
};
