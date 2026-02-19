const BASE_PROJECTS = Object.freeze([
  {
    projectId: 'prj_0990edef709a',
    name: 'Forest Fox',
    parentFolderId: 'fld_samples',
    revision: 10,
    hasGeometry: true,
    hierarchy: [
      {
        id: 'bone-root',
        name: 'root',
        kind: 'bone',
        children: [
          {
            id: 'bone-body',
            name: 'body',
            kind: 'bone',
            children: []
          }
        ]
      }
    ],
    animations: [
      {
        id: 'anim-idle',
        name: 'idle',
        length: 2.4,
        loop: true
      }
    ],
    stats: {
      bones: 8,
      cubes: 21
    },
    textures: []
  },
  {
    projectId: 'prj_95cb32d1c4f6',
    name: 'Desert Lynx',
    parentFolderId: 'fld_samples',
    revision: 21,
    hasGeometry: true,
    hierarchy: [],
    animations: [
      {
        id: 'anim-breathe',
        name: 'breathe',
        length: 3.2,
        loop: true
      }
    ],
    stats: {
      bones: 5,
      cubes: 13
    },
    textures: []
  },
  {
    projectId: 'prj_2ca5f18b3df5',
    name: 'Empty Template',
    parentFolderId: 'fld_templates',
    revision: 3,
    hasGeometry: false,
    hierarchy: [],
    animations: [],
    stats: {
      bones: 0,
      cubes: 0
    },
    textures: []
  }
]);

const BASE_TREE = Object.freeze({
  maxFolderDepth: 3,
  roots: [
    {
      kind: 'folder',
      folderId: 'fld_samples',
      name: 'Samples',
      parentFolderId: null,
      depth: 1,
      children: [
        {
          kind: 'project',
          projectId: 'prj_0990edef709a',
          name: 'Forest Fox',
          parentFolderId: 'fld_samples',
          depth: 2,
          activeJobStatus: null
        },
        {
          kind: 'project',
          projectId: 'prj_95cb32d1c4f6',
          name: 'Desert Lynx',
          parentFolderId: 'fld_samples',
          depth: 2,
          activeJobStatus: null
        },
        {
          kind: 'folder',
          folderId: 'fld_templates',
          name: 'Templates',
          parentFolderId: 'fld_samples',
          depth: 2,
          children: [
            {
              kind: 'project',
              projectId: 'prj_2ca5f18b3df5',
              name: 'Empty Template',
              parentFolderId: 'fld_templates',
              depth: 3,
              activeJobStatus: null
            }
          ]
        }
      ]
    }
  ]
});

const clone = (value) => JSON.parse(JSON.stringify(value));

const createProjectsFixture = () => clone(BASE_PROJECTS);
const createProjectTreeFixture = () => clone(BASE_TREE);

module.exports = {
  createProjectTreeFixture,
  createProjectsFixture
};
