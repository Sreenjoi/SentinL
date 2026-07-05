export function loadRazorpayScript(src: string): Promise<boolean> {
  return new Promise((resolve) => {
    const existingScript = document.querySelector(`script[src="${src}"]`) as HTMLScriptElement;
    
    if (existingScript) {
      if ((window as any).Razorpay) {
        resolve(true);
        return;
      }
      // If it exists but Razorpay isn't available yet, attach to its events
      const prevOnload = existingScript.onload;
      const prevOnerror = existingScript.onerror;
      
      existingScript.onload = (e) => {
        if (prevOnload) (prevOnload as any)(e);
        resolve(true);
      };
      existingScript.onerror = (e) => {
        if (prevOnerror) (prevOnerror as any)(e);
        resolve(false);
      };
      return;
    }
    
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => resolve(true);
    script.onerror = () => {
      resolve(false);
      script.remove(); // Clean up if failed
    };
    document.body.appendChild(script);
  });
}
