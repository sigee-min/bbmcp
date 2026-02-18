const BASE_PROJECTS = Object.freeze([
  {
    projectId: 'prj_0990edef709a',
    name: 'Forest Fox',
    revision: 10,
    hasGeometry: true,
    focusAnchor: [0, 24, 0],
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
    }
  },
  {
    projectId: 'prj_95cb32d1c4f6',
    name: 'Desert Lynx',
    revision: 21,
    hasGeometry: true,
    focusAnchor: [1, 18, 0],
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
    }
  },
  {
    projectId: 'prj_2ca5f18b3df5',
    name: 'Empty Template',
    revision: 3,
    hasGeometry: false,
    hierarchy: [],
    animations: [],
    stats: {
      bones: 0,
      cubes: 0
    }
  }
]);

const clone = (value) => JSON.parse(JSON.stringify(value));

const createProjectsFixture = () => clone(BASE_PROJECTS);

module.exports = {
  createProjectsFixture
};
