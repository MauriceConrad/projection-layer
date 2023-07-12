import { Ref, onMounted, onUnmounted, reactive } from 'vue'

export default function useElementBBox(elementRef: Ref<Element | undefined>) {
  const bbox = reactive({
    x: 0,
    y: 0,
    width: 0,
    height: 0
  });
  const updateBBox = () => {
    if (elementRef.value) {
      const bounding = elementRef.value.getBoundingClientRect();
      bbox.x = bounding.x;
      bbox.y = bounding.y;
      bbox.width = bounding.width;
      bbox.height = bounding.height;
    }
  }
  const observer = new ResizeObserver(updateBBox);
  onMounted(() => {
    if (elementRef.value) {
      observer.observe(elementRef.value);
      updateBBox();
    }
  });
  const resizeEvent = (event: Event) => {
    updateBBox();
  }
  window.addEventListener('resize', resizeEvent);
  onUnmounted(() => {
    window.removeEventListener('resize', resizeEvent);
    observer.disconnect();
  });

  return bbox;
}