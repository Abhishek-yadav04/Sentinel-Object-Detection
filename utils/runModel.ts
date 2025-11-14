import { env, InferenceSession, Tensor } from 'onnxruntime-web';

type Provider = 'webgpu' | 'webgl' | 'wasm';

const WASM_BASE_PATH = '/_next/static/chunks/pages/';

// Initialize ONNX Runtime environment
if (typeof window !== 'undefined') {
  env.wasm.wasmPaths = WASM_BASE_PATH;
  env.wasm.numThreads = 1; // Start with single thread for stability
  env.wasm.simd = true;
  env.logLevel = 'verbose'; // Temporarily enable verbose logging for debugging
}

const resolveProviderPriority = (): Provider[] => {
  if (typeof window === 'undefined') {
    return ['wasm'];
  }

  const providers: Provider[] = ['wasm'];

  if ('gpu' in navigator) {
    providers.push('webgpu');
  }

  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    const gl =
      canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (gl) {
      providers.push('webgl');
    }
  }

  return Array.from(new Set(providers));
};

const resolveModelUrl = (url: string): string => {
  if (typeof window === 'undefined') {
    return url;
  }

  try {
    return new URL(url, window.location.origin).toString();
  } catch (error) {
    console.warn('Falling back to raw model URL for ONNX session', error);
    return url;
  }
};

const fetchModelBytes = async (
  url: string
): Promise<{ bytes: Uint8Array; resolvedUrl: string }> => {
  const resolvedUrl = resolveModelUrl(url);
  const response = await fetch(resolvedUrl, { cache: 'force-cache' });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch model from ${resolvedUrl} (status ${response.status})`
    );
  }

  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  
  // Validate we got actual model data
  if (bytes.length === 0) {
    throw new Error(`Model file at ${resolvedUrl} is empty`);
  }
  
  console.log(`Loaded model from ${resolvedUrl}, size: ${bytes.length} bytes`);
  
  return { bytes, resolvedUrl };
};

export async function createModelCpu(
  urls: string | string[]
): Promise<InferenceSession> {
  const providerPriority = resolveProviderPriority();
  const errors: Array<{ provider: Provider; error: unknown }> = [];
  const sources = Array.isArray(urls) ? urls : [urls];
  const fetchErrors: string[] = [];

  let modelBytes: Uint8Array | null = null;
  let resolvedSource: string | null = null;

  for (const source of sources) {
    try {
      const result = await fetchModelBytes(source);
      modelBytes = result.bytes;
      resolvedSource = result.resolvedUrl;
      break;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      fetchErrors.push(message);
    }
  }

  if (!modelBytes) {
    throw new Error(
      `Unable to load model bytes from provided sources. Details -> ${fetchErrors.join(
        ' | '
      )}`
    );
  }

  console.log(`Attempting to create session with ${modelBytes.length} bytes across providers:`, providerPriority);

  for (const provider of providerPriority) {
    try {
      console.log(`Trying provider: ${provider}`);
      const session = await InferenceSession.create(modelBytes.buffer, {
        executionProviders: [provider],
        graphOptimizationLevel: 'all',
      });
      console.log(`Successfully created session with provider: ${provider}`);
      return session;
    } catch (error) {
      console.error(`Provider ${provider} failed:`, error);
      errors.push({ provider, error });
    }
  }

  const errorMessages = errors
    .map(({ provider, error }) => {
      const message = error instanceof Error ? error.message : String(error);
      return `${provider}: ${message}`;
    })
    .join(' | ');

  const sourceLabel = resolvedSource ?? 'the requested model';

  throw new Error(
    `Failed to initialize any ONNX Runtime backend for ${sourceLabel}. Details -> ${errorMessages}`
  );
}

export async function runModel(
  model: InferenceSession,
  preprocessedData: Tensor
): Promise<[Tensor, number]> {
  try {
    const feeds: Record<string, Tensor> = {};
    feeds[model.inputNames[0]] = preprocessedData;
    const start = Date.now();
    const outputData = await model.run(feeds);
    const end = Date.now();
    const inferenceTime = end - start;
    const output = outputData[model.outputNames[0]];
    return [output, inferenceTime];
  } catch (error) {
    console.error('runModel execution failed', error);
    throw error instanceof Error
      ? error
      : new Error('runModel execution failed');
  }
}
