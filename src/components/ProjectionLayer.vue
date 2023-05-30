<template>
  <div ref="projectionLayerRef" class="projection-layer" :style="{ '--natural-width': width, '--natural-height': height, '--natural-ratio': width / height, '--projection-layer-width': projectionLayerBBox.width, '--projection-layer-height': projectionLayerBBox.height, '--canvas-width': canvasSize.width, '--canvas-height': canvasSize.height }" @wheel="handleWheelProxy">
    <div ref="canvasRef" class="canvas">
      <slot name="canvas" />
    </div>
    <div class="matrix">
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
  panzoom?: boolean;
  transform?: Transform;
}>(), {
  panzoom: true
});
const emit = defineEmits(['update:transform']);

const ratio = computed(() => props.width / props.height);

const projectionLayerRef = ref<HTMLDivElement>();
const projectionLayerBBox = useElementBBox(projectionLayerRef);
const canvasRef = ref<HTMLDivElement>();

const layerOrgScale = computed(() => canvasSize.value.width / props.width);


const { transform, handleWheel, normalizeMatrixCoordinates, setTransform } = usePanzoom(canvasRef, computed(() => ({ x: props.x, y: props.y, width: props.width, height: props.height })), layerOrgScale);

function applyTransform(x: number, y: number, scale: number, origin: [number, number], canvasAnchor: [number, number]) {
  const realOrigin = [
    projectionLayerBBox.width * origin[0],
    projectionLayerBBox.height * origin[1]
  ];
  const realX = (x + realOrigin[0]) - canvasAnchor[0] * (canvasSize.value.width * scale);
  const realY = (y + realOrigin[1]) - canvasAnchor[1] * (canvasSize.value.height * scale);

  setTransform({
    x: (realX / scale) + ((scale - 1) * canvasSize.value.width / scale) / 2,
    y: (realY / scale) + ((scale - 1) * canvasSize.value.height / scale) / 2,
    scale
  });
}
watch(() => props.transform, () => {
  if (props.transform) {
    applyTransform(props.transform.x, props.transform.y, props.transform.scale, [0, 0], [0, 0]);
  }
});
watch(transform, () => {
  if (!_.isEqual(transform.value, props.transform)) {
    emit('update:transform', transform.value);
  }
});

const canvasSize = computed(() => {
  const width = Math.min(projectionLayerBBox.height * ratio.value, projectionLayerBBox.width);
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

onMounted(() => {
  nextTick(() => {
    applyTransform(0, 0, 1, [0.5, 0.5], [0.5, 0.5]);
  });
});

const handleWheelProxy = (event: WheelEvent) => {
  if (props.panzoom) {
    handleWheel(event);
  }
}

defineExpose({
  compose,
  applyTransform,
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