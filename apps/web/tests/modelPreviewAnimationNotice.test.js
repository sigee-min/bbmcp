const assert = require('node:assert/strict');

const { resolveAnimationPlaybackNotice } = require('../src/app/_components/ModelPreview');

module.exports = async () => {
  assert.equal(
    resolveAnimationPlaybackNotice({
      animationPlaying: false,
      selectedAnimationId: 'clip-walk',
      selectedAnimationName: 'Walk',
      availableClipNames: []
    }),
    null
  );

  assert.equal(
    resolveAnimationPlaybackNotice({
      animationPlaying: true,
      selectedAnimationId: null,
      selectedAnimationName: null,
      availableClipNames: []
    }),
    '재생 가능한 애니메이션 클립이 preview glTF에 없습니다.'
  );

  assert.equal(
    resolveAnimationPlaybackNotice({
      animationPlaying: true,
      selectedAnimationId: 'clip-run',
      selectedAnimationName: 'Run',
      availableClipNames: []
    }),
    '선택한 애니메이션 "Run" 클립을 preview glTF에서 찾지 못했습니다.'
  );

  assert.equal(
    resolveAnimationPlaybackNotice({
      animationPlaying: true,
      selectedAnimationId: 'clip-run',
      selectedAnimationName: 'Run',
      availableClipNames: ['Idle']
    }),
    '선택한 애니메이션 "Run"을 찾지 못해 "Idle" 클립으로 재생합니다.'
  );

  assert.equal(
    resolveAnimationPlaybackNotice({
      animationPlaying: true,
      selectedAnimationId: 'clip-run',
      selectedAnimationName: 'Run',
      availableClipNames: ['Run', 'Idle']
    }),
    null
  );
};
