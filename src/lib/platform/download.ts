interface StandaloneNavigator extends Navigator {
  standalone?: boolean;
}

export async function saveTextFile(
  name: string,
  mime: string,
  text: string,
): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const nav = navigator as StandaloneNavigator;
  if (
    nav.standalone === true &&
    typeof nav.canShare === 'function' &&
    typeof nav.share === 'function'
  ) {
    const file = new File([text], name, { type: mime });
    if (nav.canShare({ files: [file] })) {
      try {
        await nav.share({ files: [file] });
        return 'shared';
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return 'cancelled';
        throw err;
      }
    }
  }
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  return 'downloaded';
}
