import { Ref, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import Panzoom from '@panzoom/panzoom'
import _ from 'lodash'

export type Transform = {
  x: number;
  y: number;
  scale: number;
}
export type BBox = {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const CSS_TRANSFORM_MATRIX_VALUES = /(([-+]?(?:(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(,\s*)?){6})/

export default function usePanzoom(canvasWrapperRef: Ref<HTMLElement | undefined>, innerBoundsOfSVG: Ref<BBox>, layerOriginalScaleFactor: Ref<number>,) {
  const pz = ref<ReturnType<typeof Panzoom>>();
  const transform = ref<Transform>({ x: 0, y: 0, scale: 1 });
  const exposedTransform = ref(transform.value);

  const paused = ref(false);

  watch(transform, ({ x, y, scale }) => {
    
    if (canvasWrapperRef.value) {
      const { width, height } = canvasWrapperRef.value.getBoundingClientRect();
      const offsetX = (width / scale) * (1 - scale) * 0.5;
      const offsetY = (height / scale) * (1 - scale) * 0.5;
      
      exposedTransform.value =  {
        x: x * scale + offsetX,
        y: y * scale + offsetY,
        scale
      };
    }
  });
  const updateTransform = (newTransform: Transform) => {
    transform.value = newTransform;
  }

  const handlePanzoomChange = ({ detail }: CustomEvent) => {
    updateTransform(detail)
  }

  const handleWheel = (event: WheelEvent) => {
    if (pz.value && !paused.value) {
      const { deltaX, deltaY, ctrlKey } = event;
      const currScale = pz.value.getScale();
      if (ctrlKey) {
        const scaleDelta = (-deltaY / 100) * currScale;
        const scale = pz.value.getScale() + scaleDelta;

        pz.value.zoomToPoint(scale, event, {});
      }
      else {
        const pan = pz.value.getPan();
        const x = pan.x - deltaX / currScale;
        const y = pan.y - deltaY / currScale;
        pz.value.pan(x, y, {});
      }

      event.preventDefault();
      event.stopPropagation();
    }
    
    
  }

  const normalizeMatrixCoordinates = (clientX: number, clientY: number, innerFrame = false) => {
    if (!canvasWrapperRef.value) {
      return { x: 0, y: 0 }
    }
    const frameRelPos = {
      x: innerFrame ? clientX : clientX - canvasWrapperRef.value.getBoundingClientRect().left,
      y: innerFrame ? clientY : clientY - canvasWrapperRef.value.getBoundingClientRect().top
    }
    return {
      x: Math.round(((frameRelPos.x - innerBoundsOfSVG.value.x) / layerOriginalScaleFactor.value) / transform.value.scale),
      y: Math.round(((frameRelPos.y - innerBoundsOfSVG.value.y) / layerOriginalScaleFactor.value) / transform.value.scale)
    }
  }

  const frozenExposedTransform = ref<Transform>();

  // watch(exposedTransform, async () => {
  //   if (pz.value && !_.isEqual(frozenExposedTransform.value, exposedTransform.value)) {
  //     frozenExposedTransform.value = _.cloneDeep(exposedTransform.value);
  //     const updatedTransform = pz.value.zoomToPoint(exposedTransform.value.scale, { clientX: window.innerWidth / 2, clientY: window.innerHeight / 2 });
  //     updateTransform(updatedTransform);
  //   }
  // });

  const setTransform = (newTransform: Transform) => {
    console.log(newTransform);
    
    if (pz.value && !_.isEqual(newTransform, exposedTransform.value)) {
      console.log('->');
      
      const updatedTransform = pz.value.zoomToPoint(newTransform.scale, { clientX: window.innerWidth / 2, clientY: window.innerHeight / 2 });
      pz.value.pan(newTransform.x, newTransform.y, {});
      updateTransform(updatedTransform);
    }
  }

  onMounted(() => {
    nextTick(() => {

      if (canvasWrapperRef.value) {
        const initialTransform = (() => {
          try {
            
            const transformValueRaw = window.getComputedStyle(canvasWrapperRef.value).getPropertyValue('transform');

            const transformRawValueMatching = transformValueRaw.match(CSS_TRANSFORM_MATRIX_VALUES);
            if (transformRawValueMatching) {
              const [ , valuesListStr ] = transformRawValueMatching;
              const [ , , , , translateX, translateY ] = valuesListStr.split(/,\s*/).map(Number);
              return {
                translateX: Number(translateX),
                translateY: Number(translateY)
              }
            }
            else {
              throw new Error('No matching on transform matrix value');
            }
          }
          catch (err) {
            console.error(err);
            return null;
          }
        })();

        pz.value = Panzoom(canvasWrapperRef.value, {
          startX: initialTransform?.translateX,
          startY: initialTransform?.translateY,
          noBind: true,
          maxScale: 10
        });
  
        canvasWrapperRef.value.addEventListener('panzoomchange', handlePanzoomChange as any);
        onUnmounted(() => {
          if (canvasWrapperRef.value) {
            canvasWrapperRef.value.removeEventListener('panzoomchange', handlePanzoomChange as any)
          }
        });
      }
      else {
        console.error('Live preview wrapper is not refered');
      }
      
    });
  });

  return {
    transform: exposedTransform,
    normalizeMatrixCoordinates,
    pz,
    nativeTransform: transform,
    setTransform,
    handleWheel
  }
}