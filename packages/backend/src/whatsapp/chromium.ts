import { execFile } from 'node:child_process';
import { access, constants } from 'node:fs/promises';
import { promisify } from 'node:util';

const run = promisify(execFile);

/**
 * Flags necesarios para correr Chromium dentro de un contenedor:
 * - no-sandbox / disable-setuid-sandbox: el sandbox no funciona como root en Docker.
 * - disable-dev-shm-usage: /dev/shm por defecto son 64 MB en Docker y Chromium
 *   crashea al arrancar; con esto usa /tmp en su lugar.
 * - disable-gpu / disable-extensions: no hay GPU ni extensiones en el contenedor.
 */
export const DOCKER_CHROMIUM_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--disable-extensions',
];

export interface PreflightResult {
  ok: boolean;
  /** Versión reportada por Chromium cuando arranca bien. */
  version?: string;
  /** Detalle del fallo (stderr real de Chromium), para mostrar en el panel. */
  detail?: string;
}

/**
 * Verifica que Chromium exista y pueda ejecutarse ANTES de que open-wa intente
 * lanzarlo. open-wa/puppeteer se tragan el stderr y reportan
 * "Failed to launch the browser process! undefined", que no dice nada; esto
 * devuelve el error real (librería faltante, permisos, etc.).
 */
export async function preflightChromium(
  execPath: string,
  args: string[] = DOCKER_CHROMIUM_ARGS,
): Promise<PreflightResult> {
  try {
    await access(execPath, constants.X_OK);
  } catch {
    return {
      ok: false,
      detail: `No se encontró un Chromium ejecutable en "${execPath}". ` +
        'Revisá PUPPETEER_EXECUTABLE_PATH y que la imagen incluya chromium.',
    };
  }

  try {
    const { stdout } = await run(execPath, ['--version'], { timeout: 15_000 });
    const version = stdout.trim();

    // --version puede funcionar aunque falte algo para renderizar: probamos un
    // arranque headless real, que es lo que hará open-wa.
    await run(execPath, [...args, '--headless=new', '--dump-dom', 'about:blank'], {
      timeout: 30_000,
    });

    return { ok: true, version };
  } catch (err) {
    const e = err as { stderr?: string; message?: string };
    const detail = (e.stderr?.trim() || e.message || 'error desconocido').slice(0, 2000);
    return { ok: false, detail };
  }
}
