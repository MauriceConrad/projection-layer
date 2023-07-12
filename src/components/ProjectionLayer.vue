<template>
  <div ref="projectionLayerRef" class="projection-layer" :style="{ '--natural-width': width, '--natural-height': height, '--natural-ratio': width / height, '--projection-layer-width': projectionLayerBBox.width, '--projection-layer-height': projectionLayerBBox.height, '--canvas-width': canvasSize.width, '--canvas-height': canvasSize.height }" @wheel="handleWheelProxy">
    <div ref="canvasRef" class="canvas" :style="{ width: canvasSize.width + 'px', height: canvasSize.height + 'px' }">
      <slot name="canvas" />
    </div>
    <div ref="matrixRef" class="matrix">
      <slot name="matrix" :compose="compose" :normalize-matrix-coordinates="normalizeMatrixCoordinates" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch, watchEffect } from 'vue'
import useElementBBox from '../controllers/elementBBox'
import usePanzoom, { Transform } from '../controllers/panzoom'
import _ from 'lodash'

const props = withDefaults(defineProps<{
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
}>(), {
  offset: () => ({ left: 0, top: 0, right: 0, bottom: 0 }),
  panzoom: true
});
const emit = defineEmits(['update:transform']);

const ratio = computed(() => props.width / props.height);

const projectionLayerRef = ref<HTMLDivElement>();
const projectionLayerBBoxOriginal = useElementBBox(projectionLayerRef);
const projectionLayerBBox = computed(() => {
  return {
    x: projectionLayerBBoxOriginal.x + props.offset.left,
    y: projectionLayerBBoxOriginal.y + props.offset.top,
    width: projectionLayerBBoxOriginal.width - props.offset.left - props.offset.right,
    height: projectionLayerBBoxOriginal.height - props.offset.top - props.offset.bottom
  }
});
const canvasRef = ref<HTMLDivElement>();
const matrixRef = ref<HTMLDivElement>();

const layerOrgScale = computed(() => canvasSize.value.width / props.width);


const { transform, handleWheel, normalizeMatrixCoordinates, setTransform } = usePanzoom(canvasRef, computed(() => ({ x: props.x, y: props.y, width: props.width, height: props.height })), layerOrgScale);

function __applyTransform(x: number, y: number, scale: number, origin: [number, number], canvasAnchor: [number, number]) {
  if (isNaN(x) || isNaN(y)) {
    return;
  }
  const realOrigin = [
    projectionLayerBBox.value.width * origin[0],
    projectionLayerBBox.value.height * origin[1]
  ];
  const realX = (x + realOrigin[0]) - canvasAnchor[0] * (canvasSize.value.width * scale);
  const realY = (y + realOrigin[1]) - canvasAnchor[1] * (canvasSize.value.height * scale);

  setTransform({
    x: (realX / scale) + ((scale - 1) * canvasSize.value.width / scale) / 2,
    y: (realY / scale) + ((scale - 1) * canvasSize.value.height / scale) / 2,
    scale
  });
}
function applyTransform(x: number, y: number, scale: number, origin: [number, number], canvasAnchor: [number, number]) {
  return __applyTransform(x + props.offset.left, y + props.offset.top, scale, origin, canvasAnchor);
}

const canvasSize = computed(() => {
  const width = Math.min(projectionLayerBBox.value.height * ratio.value, projectionLayerBBox.value.width);
  return {
    width,
    height: width / ratio.value
  }
});

const compose = {
  x(x: number) {
    return x * layerOrgScale.value * transform.value.scale + transform.value.x;
  },
  y(y: number) {
    return y * layerOrgScale.value * transform.value.scale + transform.value.y;
  },
  size(size: number) {
    return size * layerOrgScale.value * transform.value.scale;
  }
}

const handleWheelProxy = (event: WheelEvent) => {
  if (props.panzoom) {
    handleWheel(event);
  }
}

watch(() => props.transform, () => {
  if (props.transform) {
    applyTransform(props.transform.x, props.transform.y, props.transform.scale, [0, 0], [0, 0]);
  }
});
watch(transform, () => {
  if (!_.isEqual(transform.value, props.transform)) {
    emit('update:transform', {
      scale: transform.value.scale,
      x: transform.value.x - props.offset.left,
      y: transform.value.y - props.offset.top
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
  normalizeMatrixCoordinates
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
    transform: translateX(calc((var(--projection-layer-width) - var(--canvas-width)) / 2 * 1px))
               translateY(calc((var(--projection-layer-height) - var(--canvas-height)) / 2 * 1px));
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