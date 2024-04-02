<template>
  <div
    ref="projectionLayerRef"
    class="projection-layer"
    :style="{
      '--natural-width': width,
      '--natural-height': height,
      '--natural-ratio': width / height,
      '--projection-layer-width': projectionLayerBBox.width,
      '--projection-layer-height': projectionLayerBBox.height,
      '--canvas-width': canvasSize.width,
      '--canvas-height': canvasSize.height,
    }"
    @wheel="handleWheelProxy"
    @touchstart="handleTouchStartProxy"
    @mousedown="handleMouseDownProxy"
  >
    <div
      ref="canvasRef"
      class="canvas"
      :style="{
        width: canvasSize.width + 'px',
        height: canvasSize.height + 'px',
      }"
    >
      <slot name="canvas" />
    </div>
    <div ref="matrixRef" class="matrix">
      <slot
        name="matrix"
        :compose="compose"
        :normalize-matrix-coordinates="normalizeMatrixCoordinates"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  toRef,
  watch,
  watchEffect,
} from "vue";
import useElementBBox from "../controllers/elementBBox";
import usePanzoom, { Transform } from "../controllers/panzoom";
import _ from "lodash";
import { useElementBounding } from "@vueuse/core";

const props = withDefaults(
  defineProps<{
    x: number;
    y: number;
    width: number;
    height: number;
    offset?: {
      left: number;
      top: number;
      bottom: number;
      right: number;
    };
    panzoom?: boolean;
    transform?: Transform;
    wheel?: boolean;
    touch?: boolean;
    mouse?: boolean;
  }>(),
  {
    offset: () => ({ left: 0, top: 0, right: 0, bottom: 0 }),
    panzoom: true,
    wheel: true,
    touch: true,
    mouse: true,
  }
);
const emit = defineEmits(["update:transform"]);

const projectionLayerRef = ref<HTMLDivElement>();
const canvasRef = ref<HTMLDivElement>();
const matrixRef = ref<HTMLDivElement>();

const layerOrgScale = computed(() => canvasSize.value.width / props.width);

const {
  projectionLayerBBox,
  ratio,
  canvasSize,
  __applyTransform,
  transform,
  handleWheel,
  handleMouseDown,
  handleMouseMove,
  handleMouseUp,
  handleTouchEnd,
  handleTouchMove,
  handleTouchStart,
  normalizeMatrixCoordinates,
  setTransform,
} = usePanzoom(
  projectionLayerRef,
  canvasRef,

  computed(() => ({
    x: props.x,
    y: props.y,
    width: props.width,
    height: props.height,
  })),
  toRef(props, "offset"),
  layerOrgScale
);

// watch(projectionLayerBBox, () => {
//   applyTransform(props.x, props.y, 1, [0.5, 0.5], [0.5, 0.5], false);
// });
onMounted(() => {
  applyTransform(props.x, props.y, 1, [0.5, 0.5], [0.5, 0.5], false);
});

function applyTransform(
  x: number,
  y: number,
  scale: number,
  origin: [number, number],
  canvasAnchor: [number, number],
  animate = false
) {
  return __applyTransform(
    x + props.offset.left,
    y + props.offset.top,
    scale,
    origin,
    canvasAnchor,
    animate
  );
}

const compose = {
  x(x: number) {
    return x * layerOrgScale.value * transform.value.scale + transform.value.x;
  },
  y(y: number) {
    return y * layerOrgScale.value * transform.value.scale + transform.value.y;
  },
  size(size: number) {
    return size * layerOrgScale.value * transform.value.scale;
  },
};

const handleWheelProxy = (event: WheelEvent) => {
  if (props.wheel) {
    handleWheel(event);
  }
};
const handleTouchEndProxy = (event: TouchEvent) => {
  if (props.touch) {
    handleTouchEnd(event);
  }
};
const handleTouchMoveProxy = (event: TouchEvent) => {
  if (props.touch) {
    handleTouchMove(event);
  }
};
const handleTouchStartProxy = (event: TouchEvent) => {
  if (props.touch) {
    handleTouchStart(event);
  }
};
const handleMouseDownProxy = (event: MouseEvent) => {
  if (props.mouse) {
    handleMouseDown(event);
  }
};
const handleMouseMoveProxy = (event: MouseEvent) => {
  if (props.mouse) {
    handleMouseMove(event);
  }
};
const handleMouseUpProxy = (event: MouseEvent) => {
  if (props.mouse) {
    handleMouseUp(event);
  }
};

window.addEventListener("mousemove", handleMouseMoveProxy);
window.addEventListener("mouseup", handleMouseUpProxy);
window.addEventListener("touchmove", handleTouchMoveProxy);
window.addEventListener("touchend", handleTouchEndProxy);

onUnmounted(() => {
  window.removeEventListener("mousemove", handleMouseMoveProxy);
  window.removeEventListener("mouseup", handleMouseUpProxy);
  window.removeEventListener("touchmove", handleTouchMoveProxy);
  window.removeEventListener("touchend", handleTouchEndProxy);
});

watch(
  () => props.transform,
  () => {
    if (props.transform) {
      applyTransform(
        props.transform.x,
        props.transform.y,
        props.transform.scale,
        [0, 0],
        [0, 0]
      );
    }
  }
);
watch(transform, () => {
  if (!_.isEqual(transform.value, props.transform)) {
    emit("update:transform", {
      scale: transform.value.scale,
      x: transform.value.x - props.offset.left,
      y: transform.value.y - props.offset.top,
    });
  }
});
onMounted(() => {
  nextTick(() => {
    applyTransform(0, 0, 1, [0.5, 0.5], [0.5, 0.5]);
  });
});

defineExpose({
  compose,
  matrix: matrixRef,
  canvas: canvasRef,
  applyTransform,
  setTransform,
  normalizeMatrixCoordinates,
  projectionLayerBBox,
});
</script>

<style scoped lang="scss">
.projection-layer {
  width: 100%;
  height: 400px;
  position: relative;
  overflow: hidden;
  .canvas {
    position: absolute;
    left: 0px;
    top: 0px;
    //--width: min(calc((var(--projection-layer-height) * var(--natural-ratio) * 1px)), calc(var(--projection-layer-width) * 1px));
    width: calc(var(--canvas-width) * 1px);
    height: calc(var(--canvas-height) * 1px);
    transform: translateX(
        calc((var(--projection-layer-width) - var(--canvas-width)) / 2 * 1px)
      )
      translateY(
        calc((var(--projection-layer-height) - var(--canvas-height)) / 2 * 1px)
      );
    //transform: translate(0px, 0px);
  }
  .matrix {
    left: 0px;
    top: 0px;
    position: absolute;
    width: 100%;
    height: 100%;
    > ::v-deep(*) {
      width: 100%;
      height: 100%;
    }
  }
}
</style>
