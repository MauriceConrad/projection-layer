import {
  Ref,
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  watch,
} from "vue";
import Panzoom from "@panzoom/panzoom";
import _ from "lodash";
import { useElementBounding } from "@vueuse/core";

export type Transform = {
  x: number;
  y: number;
  scale: number;
};
export type BBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export const CSS_TRANSFORM_MATRIX_VALUES =
  /(([-+]?(?:(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(,\s*)?){6})/;

export default function usePanzoom(
  projectionLayerRef: Ref<HTMLElement | undefined>,
  canvasWrapperRef: Ref<HTMLElement | undefined>,
  innerBoundsOfSVG: Ref<BBox>,
  offset: Ref<{ top: number; right: number; bottom: number; left: number }>,
  layerOriginalScaleFactor: Ref<number>
) {
  const pz = ref<ReturnType<typeof Panzoom>>();
  const transform = ref<Transform>({ x: 0, y: 0, scale: 1 });
  const exposedTransform = ref(transform.value);

  const paused = ref(false);

  const {
    x: projectionLayerX,
    y: projectionLayerY,
    width: projectionLayerWidth,
    height: projectionLayerHeight,
  } = useElementBounding(projectionLayerRef);
  const projectionLayerBBox = computed(() => {
    return {
      x: projectionLayerX.value + offset.value.left,
      y: projectionLayerY.value + offset.value.top,
      width:
        projectionLayerWidth.value - offset.value.left - offset.value.right,
      height:
        projectionLayerHeight.value - offset.value.top - offset.value.bottom,
    };
  });

  const ratio = computed(
    () => innerBoundsOfSVG.value.width / innerBoundsOfSVG.value.height
  );

  const canvasSize = computed(() => {
    const width = Math.min(
      projectionLayerBBox.value.height * ratio.value,
      projectionLayerBBox.value.width
    );
    return {
      width,
      height: width / ratio.value,
    };
  });

  function __applyTransform(
    x: number,
    y: number,
    scale: number,
    origin: [number, number],
    canvasAnchor: [number, number],
    animate: boolean
  ) {
    if (isNaN(x) || isNaN(y)) {
      return;
    }
    const realOrigin = [
      projectionLayerBBox.value.width * origin[0],
      projectionLayerBBox.value.height * origin[1],
    ];
    const realX =
      x + realOrigin[0] - canvasAnchor[0] * (canvasSize.value.width * scale);
    const realY =
      y + realOrigin[1] - canvasAnchor[1] * (canvasSize.value.height * scale);

    setTransform(
      {
        x: realX / scale + ((scale - 1) * canvasSize.value.width) / scale / 2,
        y: realY / scale + ((scale - 1) * canvasSize.value.height) / scale / 2,
        scale,
      },
      animate
    );
  }

  watch(transform, ({ x, y, scale }) => {
    if (canvasWrapperRef.value) {
      const { width, height } = canvasWrapperRef.value.getBoundingClientRect();
      const offsetX = (width / scale) * (1 - scale) * 0.5;
      const offsetY = (height / scale) * (1 - scale) * 0.5;

      exposedTransform.value = {
        x: x * scale + offsetX,
        y: y * scale + offsetY,
        scale,
      };
    }
  });
  const updateTransform = (newTransform: Transform) => {
    transform.value = newTransform;
  };

  const handlePanzoomChange = ({ detail }: CustomEvent) => {
    updateTransform(detail);
  };

  const handleWheel = (event: WheelEvent) => {
    if (pz.value && !paused.value) {
      const { deltaX, deltaY, ctrlKey } = event;
      const currScale = pz.value.getScale();
      if (ctrlKey) {
        const scaleDelta = (-deltaY / 100) * currScale;
        const scale = pz.value.getScale() + scaleDelta;

        pz.value.zoomToPoint(scale, event, {});
      } else {
        const pan = pz.value.getPan();
        const x = pan.x - deltaX / currScale;
        const y = pan.y - deltaY / currScale;
        pz.value.pan(x, y, {});
      }

      event.preventDefault();
      event.stopPropagation();
    }
  };

  // let touchStartPositions: [number, number][] | null = null;
  let touchStarts:
    | {
        client: [number, number];
        canvasRel: [number, number];
      }[]
    | null = null;
  let touchStartScale = 1;
  const freezeTouches = (touches: TouchList) => {
    return Array.from(touches).map((touch) => {
      const innerCanvasCoords = normalizeMatrixCoordinates(
        touch.clientX,
        touch.clientY
      );
      return {
        client: [touch.clientX, touch.clientY] as [number, number],
        canvasRel: [
          innerCanvasCoords[0] / innerBoundsOfSVG.value.width,
          innerCanvasCoords[1] / innerBoundsOfSVG.value.height,
        ] as [number, number],
      };
    });
  };

  const handleTouchStart = (event: TouchEvent) => {
    touchStarts = freezeTouches(event.touches);
    touchStartScale = pz.value!.getScale();
  };

  const handleTouchMove = (event: TouchEvent) => {
    event.preventDefault(); // Prevent default touch behavior
    // const projectionLayerElement = canvasWrapperRef.value!.parentElement!;
    if (touchStarts) {
      const touchPositions = Array.from(event.touches).map((touch) => [
        touch.clientX,
        touch.clientY,
      ]);

      const newScale = (() => {
        if (touchStarts.length >= 2 && touchPositions.length >= 2) {
          const touchStartPositionsTwoFingerDiff = Math.sqrt(
            (touchStarts[1].client[0] - touchStarts[0].client[0]) ** 2 +
              (touchStarts[1].client[1] - touchStarts[0].client[1]) ** 2
          );
          const touchPositionsTwoFingerDiff = Math.sqrt(
            (touchPositions[1][0] - touchPositions[0][0]) ** 2 +
              (touchPositions[1][1] - touchPositions[0][1]) ** 2
          );
          return (
            touchStartScale *
            (touchPositionsTwoFingerDiff / touchStartPositionsTwoFingerDiff)
          );
        } else {
          return touchStartScale;
        }
      })();

      const innerWrapperRelPos = [
        (touchPositions[0][0] - projectionLayerBBox.value.x) /
          projectionLayerBBox.value.width,
        (touchPositions[0][1] - projectionLayerBBox.value.y) /
          projectionLayerBBox.value.height,
      ] as [number, number];
      const innerCanvasRel = touchStarts[0].canvasRel;

      __applyTransform(
        0,
        0,
        newScale,
        innerWrapperRelPos,
        innerCanvasRel,
        false
      );
    }
  };

  const handleTouchEnd = (event: TouchEvent) => {
    if (event.touches.length === 0) {
      touchStarts = null;
    } else {
      touchStarts = touchStarts = freezeTouches(event.touches);
    }
  };
  let dragStart: [number, number] | null = null;
  let dragStartFrozenPan: { x: number; y: number } | null = null;
  const handleMouseDown = (event: MouseEvent) => {
    dragStart = [event.clientX, event.clientY];
    dragStartFrozenPan = pz.value!.getPan();
  };
  const handleMouseUp = (event: MouseEvent) => {
    dragStart = null;
    dragStartFrozenPan = null;
  };
  const handleMouseMove = (event: MouseEvent) => {
    if (dragStart && dragStartFrozenPan) {
      const deltaX = event.clientX - dragStart[0];
      const deltaY = event.clientY - dragStart[1];
      const x = dragStartFrozenPan.x - -deltaX / pz.value!.getScale();
      const y = dragStartFrozenPan.y - -deltaY / pz.value!.getScale();
      pz.value!.pan(x, y, {});
    }
  };

  const normalizeMatrixCoordinates = (
    clientX: number,
    clientY: number,
    innerFrame = false
  ): [number, number] => {
    if (!canvasWrapperRef.value) {
      return [0, 0];
    }
    const frameRelPos = [
      innerFrame
        ? clientX
        : clientX - canvasWrapperRef.value.getBoundingClientRect().left,
      innerFrame
        ? clientY
        : clientY - canvasWrapperRef.value.getBoundingClientRect().top,
    ];
    return [
      Math.round(
        (frameRelPos[0] - innerBoundsOfSVG.value.x) /
          layerOriginalScaleFactor.value /
          transform.value.scale
      ),
      Math.round(
        (frameRelPos[1] - innerBoundsOfSVG.value.y) /
          layerOriginalScaleFactor.value /
          transform.value.scale
      ),
    ];
  };

  const frozenExposedTransform = ref<Transform>();

  // watch(exposedTransform, async () => {
  //   if (pz.value && !_.isEqual(frozenExposedTransform.value, exposedTransform.value)) {
  //     frozenExposedTransform.value = _.cloneDeep(exposedTransform.value);
  //     const updatedTransform = pz.value.zoomToPoint(exposedTransform.value.scale, { clientX: window.innerWidth / 2, clientY: window.innerHeight / 2 });
  //     updateTransform(updatedTransform);
  //   }
  // });

  const setTransform = (newTransform: Transform, animate: boolean) => {
    if (pz.value && !_.isEqual(newTransform, exposedTransform.value)) {
      const updatedTransform = pz.value.zoomToPoint(newTransform.scale, {
        clientX: window.innerWidth / 2,
        clientY: window.innerHeight / 2,
      });
      pz.value.pan(newTransform.x, newTransform.y, {
        animate,
      });
      updateTransform(updatedTransform);
    }
  };

  onMounted(() => {
    nextTick(() => {
      if (canvasWrapperRef.value) {
        const initialTransform = (() => {
          try {
            const transformValueRaw = window
              .getComputedStyle(canvasWrapperRef.value)
              .getPropertyValue("transform");
            const transformRawValueMatching = transformValueRaw.match(
              CSS_TRANSFORM_MATRIX_VALUES
            );
            if (transformRawValueMatching) {
              const [, valuesListStr] = transformRawValueMatching;
              const [, , , , translateX, translateY] = valuesListStr
                .split(/,\s*/)
                .map(Number);
              return {
                translateX: Number(translateX),
                translateY: Number(translateY),
              };
            } else {
              throw new Error("No matching on transform matrix value");
            }
          } catch (err) {
            console.error(err);
            return null;
          }
        })();

        pz.value = Panzoom(canvasWrapperRef.value, {
          startX: initialTransform?.translateX,
          startY: initialTransform?.translateY,
          noBind: true,
          maxScale: 10,
        });

        canvasWrapperRef.value.addEventListener(
          "panzoomchange",
          handlePanzoomChange as any
        );
        onUnmounted(() => {
          if (canvasWrapperRef.value) {
            canvasWrapperRef.value.removeEventListener(
              "panzoomchange",
              handlePanzoomChange as any
            );
          }
        });
      } else {
        console.error("Live preview wrapper is not refered");
      }
    });
  });

  return {
    projectionLayerBBox,
    ratio,
    canvasSize,
    __applyTransform,
    transform: exposedTransform,
    normalizeMatrixCoordinates,
    pz,
    nativeTransform: transform,
    setTransform,
    handleWheel,
    handleMouseDown,
    handleMouseUp,
    handleMouseMove,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
  };
}
