/** Persist bounded native screenshots; never put encoded pixels in model-visible text. */
export async function prepareObservation(state, attachments, supportsImages, signal) {
  const screenshots = state.screenshots ?? [];
  const result = {
    windowId: state.windowId, observationId: state.observationId,
    window: state.window, accessibility: state.accessibility,
    screenshots: [], imageInput: supportsImages,
  };
  if (!attachments) throw new Error('DSH attachment storage is unavailable');
  const images = screenshots.map(shot => {
    const match = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/]*={0,2})$/.exec(shot.url);
    if (!match || match[2].length > 32 * 1024 * 1024) throw new Error('Invalid or oversized Sky screenshot');
    const data = Buffer.from(match[2], 'base64');
    if (data.toString('base64') !== match[2]) throw new Error('Invalid screenshot base64 encoding');
    return { data, mediaType: match[1] };
  });
  signal.throwIfAborted();
  const refs = images.length ? await attachments.saveImages(images) : [];
  signal.throwIfAborted();
  result.screenshots = screenshots.map((shot, index) => ({
    id: shot.id, width: shot.width ?? null, height: shot.height ?? null,
    originX: shot.originX ?? null, originY: shot.originY ?? null,
    zIndex: shot.zIndex ?? 0, attachment: refs[index],
  }));
  if (!supportsImages) result.notice = '当前模型未声明图片能力；截图已保存，只提供 UIA 文本。不要猜测截图坐标。';
  return result;
}

/** Pure replayable result projection; image references also remain in the canonical tool value. */
export function renderResult(_args, value) {
  const content = [{ type: 'text', text: JSON.stringify(value) }];
  if (value?.imageInput === true) {
    for (const shot of value.screenshots) content.push({ type: 'image', attachment: shot.attachment });
  }
  return content;
}
