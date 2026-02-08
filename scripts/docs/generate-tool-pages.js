/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');
const ts = require('typescript');

const repoRoot = path.resolve(__dirname, '..', '..');
const docsRoot = path.join(repoRoot, 'apps', 'docs', 'content', 'docs');

const CATEGORY_ORDER = ['project', 'modeling', 'texturing', 'animation', 'system'];

const MINIMAL_REQUEST_OVERRIDES = {
  read_texture: {
    name: 'texture',
  },
  reload_plugins: {
    confirm: true,
  },
  paint_faces: {
    target: {
      cubeName: 'cube',
    },
    op: {
      op: 'set_pixel',
    },
  },
  paint_mesh_face: {
    target: {
      meshName: 'mesh',
    },
    op: {
      op: 'set_pixel',
    },
  },
  delete_texture: {
    name: 'texture',
  },
  assign_texture: {
    textureName: 'texture',
    cubeNames: ['cube'],
  },
  update_bone: {
    name: 'bone',
  },
  delete_bone: {
    name: 'bone',
  },
  add_cube: {
    name: 'cube',
    from: [0, 0, 0],
    to: [1, 1, 1],
  },
  update_cube: {
    name: 'cube',
  },
  delete_cube: {
    name: 'cube',
  },
  add_mesh: {
    name: 'mesh',
    vertices: [
      { id: 'v0', pos: [0, 0, 0] },
      { id: 'v1', pos: [1, 0, 0] },
      { id: 'v2', pos: [0, 1, 0] },
    ],
    faces: [{ vertices: ['v0', 'v1', 'v2'] }],
  },
  update_mesh: {
    name: 'mesh',
  },
  delete_mesh: {
    name: 'mesh',
  },
  create_animation_clip: {
    name: 'clip',
    length: 1,
    loop: true,
    fps: 20,
  },
  update_animation_clip: {
    name: 'clip',
  },
  delete_animation_clip: {
    name: 'clip',
  },
  set_frame_pose: {
    clip: 'clip',
    frame: 0,
    bones: [
      {
        name: 'bone',
        rot: [0, 0, 0],
      },
    ],
  },
  set_trigger_keyframes: {
    clip: 'clip',
    channel: 'timeline',
    keys: [{ time: 0, value: 'marker' }],
  },
  export: {
    format: 'java_block_item_json',
    destPath: './out/model.json',
  },
};

const CATEGORY_CONFIG = {
  project: {
    tools: ['ensure_project', 'get_project_state', 'validate', 'render_preview', 'export', 'export_trace_log'],
    en: {
      title: 'Project Tools',
      description: 'Project lifecycle, validation, preview, and export tools.',
      short: 'Project',
    },
    ko: {
      title: '프로젝트 도구',
      description: '프로젝트 라이프사이클, 검증, 프리뷰, 내보내기 도구.',
      short: '프로젝트',
    },
  },
  modeling: {
    tools: [
      'add_bone',
      'update_bone',
      'delete_bone',
      'add_cube',
      'update_cube',
      'delete_cube',
      'add_mesh',
      'update_mesh',
      'delete_mesh',
    ],
    en: {
      title: 'Modeling Tools',
      description: 'Bone, cube, and mesh modeling operations.',
      short: 'Modeling',
    },
    ko: {
      title: '모델링 도구',
      description: '본, 큐브, 메시 기반 모델링 작업 도구.',
      short: '모델링',
    },
  },
  texturing: {
    tools: ['read_texture', 'assign_texture', 'paint_faces', 'paint_mesh_face', 'delete_texture'],
    en: {
      title: 'Texturing Tools',
      description: 'Texture assignment, paint operations, and texture state inspection.',
      short: 'Texturing',
    },
    ko: {
      title: '텍스처 도구',
      description: '텍스처 할당, 페인팅, 텍스처 상태 확인 도구.',
      short: '텍스처',
    },
  },
  animation: {
    tools: [
      'create_animation_clip',
      'update_animation_clip',
      'delete_animation_clip',
      'set_frame_pose',
      'set_trigger_keyframes',
    ],
    en: {
      title: 'Animation Tools',
      description: 'Clip and keyframe tools for deterministic animation workflows.',
      short: 'Animation',
    },
    ko: {
      title: '애니메이션 도구',
      description: '클립/키프레임 기반 애니메이션 운영 도구.',
      short: '애니메이션',
    },
  },
  system: {
    tools: ['list_capabilities', 'reload_plugins'],
    en: {
      title: 'System Tools',
      description: 'Capability discovery and runtime control tools.',
      short: 'System',
    },
    ko: {
      title: '시스템 도구',
      description: '기능 조회 및 런타임 제어 도구.',
      short: '시스템',
    },
  },
};

const KO_TOOL_TITLES = {
  list_capabilities: '기능 목록 조회',
  ensure_project: '프로젝트 준비',
  get_project_state: '프로젝트 상태 조회',
  export_trace_log: '트레이스 로그 내보내기',
  render_preview: '프리뷰 렌더링',
  validate: '검증',
  export: '내보내기',
  read_texture: '텍스처 읽기',
  reload_plugins: '플러그인 재로드',
  paint_faces: '큐브 페이스 페인팅',
  paint_mesh_face: '메시 페이스 페인팅',
  delete_texture: '텍스처 삭제',
  assign_texture: '텍스처 할당',
  add_bone: '본 추가',
  update_bone: '본 수정',
  delete_bone: '본 삭제',
  add_cube: '큐브 추가',
  update_cube: '큐브 수정',
  delete_cube: '큐브 삭제',
  add_mesh: '메시 추가',
  update_mesh: '메시 수정',
  delete_mesh: '메시 삭제',
  create_animation_clip: '애니메이션 클립 생성',
  update_animation_clip: '애니메이션 클립 수정',
  delete_animation_clip: '애니메이션 클립 삭제',
  set_frame_pose: '프레임 포즈 설정',
  set_trigger_keyframes: '트리거 키프레임 설정',
};

function loadToolData() {
  const tmpDir = path.join(repoRoot, '.ashfox', 'tmp');
  const outFile = path.join(tmpDir, 'tool-doc-source.cjs');
  fs.mkdirSync(tmpDir, { recursive: true });

  esbuild.buildSync({
    stdin: {
      contents: `
        import { toolSchemas } from './packages/contracts/src/mcpSchemas/toolSchemas';
        import { MCP_HIGH_LEVEL_TOOLS, MCP_LOW_LEVEL_TOOLS } from './packages/runtime/src/transport/mcp/tools';
        module.exports = {
          toolSchemas,
          tools: [...MCP_HIGH_LEVEL_TOOLS, ...MCP_LOW_LEVEL_TOOLS].map((tool) => ({
            name: tool.name,
            title: tool.title,
            description: tool.description,
            inputSchema: tool.inputSchema
          }))
        };
      `,
      resolveDir: repoRoot,
      sourcefile: 'tool-doc-entry.ts',
      loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: outFile,
    tsconfig: path.join(repoRoot, 'tsconfig.json'),
    logLevel: 'silent',
  });

  const loaded = require(outFile);
  fs.rmSync(outFile, { force: true });
  return loaded;
}

function loadToolResultExamples() {
  const configPath = path.join(repoRoot, 'tsconfig.json');
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  if (configFile.error) {
    throw new Error(`Failed to read tsconfig.json: ${configFile.error.messageText}`);
  }
  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, repoRoot);
  const program = ts.createProgram({
    rootNames: parsed.fileNames,
    options: parsed.options,
  });
  const checker = program.getTypeChecker();
  const targetSuffix = path.join('packages', 'runtime', 'src', 'types', 'tools', 'results.ts').replace(/\\/g, '/');
  const sourceFile = program
    .getSourceFiles()
    .find((sf) => sf.fileName.replace(/\\/g, '/').endsWith(targetSuffix));
  if (!sourceFile) {
    throw new Error('Cannot locate packages/runtime/src/types/tools/results.ts in TypeScript program.');
  }
  const toolResultMap = sourceFile.statements.find(
    (node) => ts.isInterfaceDeclaration(node) && node.name.text === 'ToolResultMap',
  );
  if (!toolResultMap) {
    throw new Error('Cannot find ToolResultMap interface in packages/runtime/src/types/tools/results.ts.');
  }

  const samples = {};
  for (const member of toolResultMap.members) {
    if (!ts.isPropertySignature(member) || !member.type || !member.name) continue;
    const toolName =
      ts.isIdentifier(member.name) || ts.isStringLiteral(member.name) ? member.name.text : null;
    if (!toolName) continue;
    const type = checker.getTypeFromTypeNode(member.type);
    samples[toolName] = sampleTsType(checker, type, sourceFile);
  }
  return samples;
}

function sampleTsType(checker, type, fallbackNode, depth = 0, seen = new Set()) {
  if (!type || depth > 6) return 'value';
  if (type.flags & ts.TypeFlags.Undefined) return null;
  if (type.flags & ts.TypeFlags.Null) return null;

  if (typeof type.isUnion === 'function' && type.isUnion()) {
    const candidate = type.types.find((t) => (t.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null)) === 0) || type.types[0];
    return sampleTsType(checker, candidate, fallbackNode, depth + 1, seen);
  }

  if (typeof type.isIntersection === 'function' && type.isIntersection()) {
    const objectParts = type.types
      .map((part) => sampleTsType(checker, part, fallbackNode, depth + 1, seen))
      .filter((part) => part && typeof part === 'object' && !Array.isArray(part));
    if (objectParts.length > 0) {
      return Object.assign({}, ...objectParts);
    }
    return sampleTsType(checker, type.types[0], fallbackNode, depth + 1, seen);
  }

  if (type.flags & ts.TypeFlags.BooleanLiteral) {
    return type.intrinsicName === 'true';
  }
  if (typeof type.isStringLiteral === 'function' && type.isStringLiteral()) {
    return type.value;
  }
  if (typeof type.isNumberLiteral === 'function' && type.isNumberLiteral()) {
    return type.value;
  }

  if (type.flags & ts.TypeFlags.StringLike) return 'value';
  if (type.flags & ts.TypeFlags.NumberLike) return 0;
  if (type.flags & ts.TypeFlags.BooleanLike) return false;
  if (type.flags & ts.TypeFlags.BigIntLike) return 0;

  if (checker.isTupleType(type)) {
    const tupleArgs = checker.getTypeArguments(type);
    return tupleArgs.slice(0, 3).map((entry) => sampleTsType(checker, entry, fallbackNode, depth + 1, seen));
  }
  if (checker.isArrayType(type)) {
    const args = checker.getTypeArguments(type);
    const elementType = args[0];
    if (!elementType) return [];
    return [sampleTsType(checker, elementType, fallbackNode, depth + 1, seen)];
  }

  if (seen.has(type)) return {};
  seen.add(type);

  const properties = checker.getPropertiesOfType(type);
  if (properties.length > 0) {
    const out = {};
    for (const property of properties) {
      const declaration = property.valueDeclaration || property.declarations?.[0] || fallbackNode;
      const optional = Boolean(property.flags & ts.SymbolFlags.Optional);
      if (optional) continue;
      const propertyType = checker.getTypeOfSymbolAtLocation(property, declaration);
      out[property.name] = sampleTsType(checker, propertyType, declaration, depth + 1, seen);
    }
    seen.delete(type);
    return out;
  }

  seen.delete(type);
  if (type.flags & ts.TypeFlags.Object) return {};
  return 'value';
}

function toSlug(toolName) {
  return toolName.replace(/_/g, '-');
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeUtf8(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf8');
}

function yamlEscape(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function mdEscape(value) {
  return String(value ?? '-')
    .replace(/[{}]/g, '\\$&')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, '<br/>');
}

function mdxText(value) {
  return String(value ?? '').replace(/[{}]/g, '\\$&');
}

function typeLabel(schema) {
  if (!schema || typeof schema !== 'object') return 'any';
  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    return `enum(${schema.enum.map((v) => JSON.stringify(v)).join(', ')})`;
  }
  if (Array.isArray(schema.anyOf) && schema.anyOf.length > 0) {
    return schema.anyOf.map((item) => typeLabel(item)).join(' | ');
  }
  if (Array.isArray(schema.oneOf) && schema.oneOf.length > 0) {
    return schema.oneOf.map((item) => typeLabel(item)).join(' | ');
  }
  if (schema.type === 'array') {
    return `array<${typeLabel(schema.items)}>`;
  }
  if (schema.type === 'object') return 'object';
  if (Array.isArray(schema.type)) return schema.type.join(' | ');
  if (schema.type) return String(schema.type);
  return 'any';
}

function constraintLabel(schema) {
  if (!schema || typeof schema !== 'object') return '-';
  const parts = [];
  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    parts.push(`enum: ${schema.enum.map((v) => JSON.stringify(v)).join(', ')}`);
  }
  if (schema.minimum != null) parts.push(`min: ${schema.minimum}`);
  if (schema.maximum != null) parts.push(`max: ${schema.maximum}`);
  if (schema.minItems != null) parts.push(`minItems: ${schema.minItems}`);
  if (schema.maxItems != null) parts.push(`maxItems: ${schema.maxItems}`);
  if (schema.additionalProperties === false && schema.type === 'object') {
    parts.push('additionalProperties=false');
  }
  if (Array.isArray(schema.anyOf) && schema.anyOf.length > 0) {
    parts.push(`anyOf(${schema.anyOf.length})`);
  }
  if (Array.isArray(schema.oneOf) && schema.oneOf.length > 0) {
    parts.push(`oneOf(${schema.oneOf.length})`);
  }
  return parts.length > 0 ? parts.join(', ') : '-';
}

function buildFieldRows(schema, prefix = '', depth = 0) {
  if (!schema || typeof schema !== 'object' || depth > 4) return [];
  const props = schema.properties && typeof schema.properties === 'object' ? schema.properties : {};
  const required = new Set(Array.isArray(schema.required) ? schema.required : []);
  const rows = [];

  for (const [key, propSchema] of Object.entries(props)) {
    const child = propSchema && typeof propSchema === 'object' ? propSchema : {};
    const fieldPath = prefix ? `${prefix}.${key}` : key;
    rows.push({
      field: fieldPath,
      required: required.has(key),
      type: typeLabel(child),
      description: child.description || '-',
      constraints: constraintLabel(child),
    });

    if (child.type === 'object' && child.properties) {
      rows.push(...buildFieldRows(child, fieldPath, depth + 1));
    }
    if (child.type === 'array' && child.items && typeof child.items === 'object' && child.items.type === 'object') {
      rows.push(...buildFieldRows(child.items, `${fieldPath}[]`, depth + 1));
    }
  }

  return rows;
}

function sampleValue(schema, depth = 0) {
  if (!schema || typeof schema !== 'object' || depth > 4) return 'value';
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];
  if (schema.type === 'string') return 'value';
  if (schema.type === 'number' || schema.type === 'integer') {
    if (typeof schema.minimum === 'number') return schema.minimum;
    return 0;
  }
  if (schema.type === 'boolean') return false;
  if (schema.type === 'array') {
    const minItems = typeof schema.minItems === 'number' ? schema.minItems : 0;
    if (!schema.items) return [];
    if (minItems > 0) return Array.from({ length: Math.min(minItems, 3) }, () => sampleValue(schema.items, depth + 1));
    return [sampleValue(schema.items, depth + 1)];
  }
  if (schema.type === 'object') {
    const props = schema.properties && typeof schema.properties === 'object' ? schema.properties : {};
    const required = new Set(Array.isArray(schema.required) ? schema.required : []);
    const variants = Array.isArray(schema.anyOf)
      ? schema.anyOf
      : Array.isArray(schema.oneOf)
        ? schema.oneOf
        : [];
    if (variants.length > 0) {
      const firstVariant = variants[0];
      if (firstVariant && typeof firstVariant === 'object' && Array.isArray(firstVariant.required)) {
        for (const key of firstVariant.required) required.add(key);
      }
    }
    const out = {};
    for (const key of required) {
      out[key] = sampleValue(props[key], depth + 1);
    }
    return out;
  }
  if (Array.isArray(schema.anyOf) && schema.anyOf.length > 0) return sampleValue(schema.anyOf[0], depth + 1);
  if (Array.isArray(schema.oneOf) && schema.oneOf.length > 0) return sampleValue(schema.oneOf[0], depth + 1);
  return 'value';
}

function buildMinimalRequest(toolName, schema) {
  const override = MINIMAL_REQUEST_OVERRIDES[toolName];
  if (override) {
    return override;
  }
  if (!schema || typeof schema !== 'object') return {};
  const required = Array.isArray(schema.required) ? schema.required : [];
  const props = schema.properties && typeof schema.properties === 'object' ? schema.properties : {};
  const out = {};

  for (const key of required) {
    out[key] = sampleValue(props[key], 0);
  }

  if (required.length === 0) {
    return {};
  }
  return out;
}

function conditionalRules(schema) {
  const rules = [];
  if (Array.isArray(schema?.anyOf) && schema.anyOf.length > 0) {
    rules.push({ keyword: 'anyOf', value: schema.anyOf });
  }
  if (Array.isArray(schema?.oneOf) && schema.oneOf.length > 0) {
    rules.push({ keyword: 'oneOf', value: schema.oneOf });
  }
  return rules;
}

function categoryMeta(locale, categoryId) {
  return CATEGORY_CONFIG[categoryId][locale];
}

function toolTitle(locale, tool) {
  if (locale === 'ko') {
    return KO_TOOL_TITLES[tool.name] || tool.title;
  }
  return tool.title;
}

function generateToolPage(locale, categoryId, tool, schema, responseExample) {
  const rows = buildFieldRows(schema);
  const rules = conditionalRules(schema);
  const minimalRequest = buildMinimalRequest(tool.name, schema);
  const minimalResponse = { structuredContent: responseExample ?? {} };
  const category = categoryMeta(locale, categoryId);
  const title = toolTitle(locale, tool);
  const description =
    locale === 'ko'
      ? `${title} 도구의 입력 스펙과 필드 동작 설명.`
      : `Input schema and field behavior for ${tool.name}.`;
  const strictSchema = schema?.additionalProperties === false;
  const requiredLabel = locale === 'ko' ? '필수' : 'Required';
  const yes = '✅';
  const no = '❌';

  const headerLines =
    locale === 'ko'
      ? [
          '## 개요',
          `- 도구 이름: \`${tool.name}\``,
          `- 카테고리: ${category.short}`,
          `- Strict schema: \`${strictSchema ? 'true' : 'false/partial'}\``,
          '',
          '## 도구 설명',
          mdxText(tool.description),
          '',
          '## 입력 스키마 (JSON)',
        ]
      : [
          '## Overview',
          `- Tool name: \`${tool.name}\``,
          `- Category: ${category.short}`,
          `- Strict schema: \`${strictSchema ? 'true' : 'false/partial'}\``,
          '',
          '## Tool Description',
          mdxText(tool.description),
          '',
          '## Input Schema (JSON)',
        ];

  const fieldSection = [];
  if (rows.length > 0) {
    fieldSection.push(locale === 'ko' ? '## 필드 레퍼런스' : '## Field Reference');
    fieldSection.push('| Field | Type | ' + requiredLabel + ' | Description | Constraints |');
    fieldSection.push('| --- | --- | --- | --- | --- |');
    for (const row of rows) {
      fieldSection.push(
        `| \`${mdEscape(row.field)}\` | \`${mdEscape(row.type)}\` | ${row.required ? yes : no} | ${mdEscape(row.description)} | ${mdEscape(row.constraints)} |`,
      );
    }
  } else {
    fieldSection.push(locale === 'ko' ? '## 필드 레퍼런스' : '## Field Reference');
    fieldSection.push(locale === 'ko' ? '입력 필드가 없습니다.' : 'This tool has no input fields.');
  }

  const ruleSection = [];
  if (rules.length > 0) {
    ruleSection.push(locale === 'ko' ? '## 조건 규칙' : '## Conditional Rules');
    for (const rule of rules) {
      ruleSection.push(`### \`${rule.keyword}\``);
      ruleSection.push('```json');
      ruleSection.push(JSON.stringify(rule.value, null, 2));
      ruleSection.push('```');
    }
  }

  const footer =
    locale === 'ko'
      ? [
          '## 최소 요청 예시',
          '```json',
          JSON.stringify(minimalRequest, null, 2),
          '```',
          '',
          '## 응답 예시',
          '```json',
          JSON.stringify(minimalResponse, null, 2),
          '```',
          '',
          '## 운영 노트',
          '- 변경 도구는 `ifRevision` 사용을 권장합니다.',
          '- 스키마에 없는 필드는 보내지 마세요 (strict schema).',
          '- `validate`로 최종 상태를 확인한 후 `export`를 수행하세요.',
        ]
      : [
          '## Minimal Request Example',
          '```json',
          JSON.stringify(minimalRequest, null, 2),
          '```',
          '',
          '## Response Example',
          '```json',
          JSON.stringify(minimalResponse, null, 2),
          '```',
          '',
          '## Operational Notes',
          '- Use `ifRevision` for mutation calls when available.',
          '- Do not send fields outside the declared schema.',
          '- Run `validate` before `export` for release safety.',
        ];

  return [
    '---',
    `title: ${title}`,
    `description: "${yamlEscape(description)}"`,
    '---',
    '',
    ...headerLines,
    '```json',
    JSON.stringify(schema || {}, null, 2),
    '```',
    '',
    ...fieldSection,
    '',
    ...ruleSection,
    ...(ruleSection.length > 0 ? [''] : []),
    ...footer,
    '',
  ].join('\n');
}

function generateCategoryIndex(locale, categoryId, categoryTools, toolsByName) {
  const category = categoryMeta(locale, categoryId);
  const cards = categoryTools
    .map((toolName) => {
      const tool = toolsByName.get(toolName);
      return `  <Card title="${toolTitle(locale, tool)}" href="./${toSlug(toolName)}" />`;
    })
    .join('\n');

  const intro =
    locale === 'ko'
      ? `이 섹션은 ${category.title}를 개별 도구 단위로 분리해 설명합니다.`
      : `This section breaks down ${category.title} into one page per tool.`;

  return [
    '---',
    `title: ${category.title}`,
    `description: "${yamlEscape(category.description)}"`,
    '---',
    '',
    intro,
    '',
    '<Cards>',
    cards,
    '</Cards>',
    '',
  ].join('\n');
}

function generateToolReferenceIndex(locale) {
  const sectionTitle = locale === 'ko' ? '도구 레퍼런스' : 'Tool Reference';
  const description =
    locale === 'ko'
      ? '카테고리별 폴더 구조와 툴별 상세 페이지로 구성된 ashfox MCP 도구 참조.'
      : 'Category-based reference with one dedicated page per ashfox MCP tool.';

  const cards = CATEGORY_ORDER.map((categoryId) => {
    const category = categoryMeta(locale, categoryId);
    return `  <Card title="${category.title}" href="./${categoryId}" />`;
  }).join('\n');

  const intro =
    locale === 'ko'
      ? '모든 도구는 카테고리 폴더에 정리되어 있으며, 각 페이지에 입력 스펙과 필드 설명이 포함됩니다.'
      : 'Every tool is grouped in category folders, and each page includes schema and field-level explanations.';

  return [
    '---',
    `title: ${sectionTitle}`,
    `description: "${yamlEscape(description)}"`,
    '---',
    '',
    intro,
    '',
    '<Cards>',
    cards,
    '</Cards>',
    '',
  ].join('\n');
}

function writeToolReferenceLocale(locale, toolsByName, schemasByName, resultExamplesByName) {
  const baseDir = path.join(docsRoot, locale, 'tool-reference');
  fs.rmSync(baseDir, { recursive: true, force: true });
  ensureDir(baseDir);

  const rootMeta = {
    title: locale === 'ko' ? '도구 레퍼런스' : 'Tool Reference',
    pages: [...CATEGORY_ORDER],
  };
  writeUtf8(path.join(baseDir, 'meta.json'), JSON.stringify(rootMeta, null, 2) + '\n');
  writeUtf8(path.join(baseDir, 'index.mdx'), generateToolReferenceIndex(locale));

  for (const categoryId of CATEGORY_ORDER) {
    const category = CATEGORY_CONFIG[categoryId];
    const categoryDir = path.join(baseDir, categoryId);
    ensureDir(categoryDir);

    const pages = category.tools.map((toolName) => toSlug(toolName));
    const categoryMetaJson = {
      title: categoryMeta(locale, categoryId).title,
      pages,
    };
    writeUtf8(path.join(categoryDir, 'meta.json'), JSON.stringify(categoryMetaJson, null, 2) + '\n');
    writeUtf8(path.join(categoryDir, 'index.mdx'), generateCategoryIndex(locale, categoryId, category.tools, toolsByName));

    for (const toolName of category.tools) {
      const tool = toolsByName.get(toolName);
      const schema = schemasByName[toolName] || tool.inputSchema || {};
      const responseExample = resultExamplesByName?.[toolName] ?? {};
      writeUtf8(
        path.join(categoryDir, `${toSlug(toolName)}.mdx`),
        generateToolPage(locale, categoryId, tool, schema, responseExample),
      );
    }
  }
}

function validateCoverage(toolsByName) {
  const allCategoryTools = new Set(CATEGORY_ORDER.flatMap((id) => CATEGORY_CONFIG[id].tools));
  const allTools = new Set(toolsByName.keys());
  const missingFromCategories = [...allTools].filter((name) => !allCategoryTools.has(name));
  const unknownInCategories = [...allCategoryTools].filter((name) => !allTools.has(name));

  if (missingFromCategories.length > 0 || unknownInCategories.length > 0) {
    throw new Error(
      [
        'Tool coverage mismatch.',
        `Missing from categories: ${missingFromCategories.join(', ') || 'none'}`,
        `Unknown in categories: ${unknownInCategories.join(', ') || 'none'}`,
      ].join('\n'),
    );
  }
}

function main() {
  const { toolSchemas, tools } = loadToolData();
  const toolResultExamples = loadToolResultExamples();
  const toolsByName = new Map(tools.map((tool) => [tool.name, tool]));
  validateCoverage(toolsByName);

  writeToolReferenceLocale('en', toolsByName, toolSchemas, toolResultExamples);
  writeToolReferenceLocale('ko', toolsByName, toolSchemas, toolResultExamples);

  console.log('Generated tool reference pages for locales: en, ko');
}

main();

