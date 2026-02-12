---
title: "엔티티 워크플로"
description: "GeckoLib 대상 엔티티를 안정적으로 제작하는 종단 간 가이드"
summary: "GeckoLib 대상 엔티티를 안정적으로 제작하는 종단 간 가이드"
---

# 엔티티 워크플로

이 가이드는 GeckoLib 대상 엔티티를 제작할 때, 모델링부터 애니메이션/검증/내보내기까지 단계가 서로 충돌하지 않도록 설계된 흐름입니다. 핵심은 단계 간 의존성을 인정하고 순서를 지키는 것입니다.

## 권장 순서

1. `ensure_project`에서 `format: "geckolib"`로 시작합니다.
2. `add_bone`, `add_cube`로 구조와 형태를 먼저 안정화합니다.
3. `assign_texture`, `paint_faces`/`paint_mesh_face`로 표면 표현을 완성합니다.
4. `create_animation_clip`, `set_frame_pose`, 필요 시 `set_trigger_keyframes`를 적용합니다.
5. `render_preview`, `validate`를 거쳐 최종 내보내기를 수행합니다.

애니메이션을 너무 일찍 시작하면 모델/텍스처 변경 시 타임라인이 쉽게 깨집니다. 구조와 표면 단계가 충분히 안정된 이후에 애니메이션을 올리는 전략이 전체 제작 시간을 줄입니다.