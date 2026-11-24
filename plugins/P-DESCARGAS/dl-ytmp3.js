import axios from 'axios'
import fs from 'fs'
import path from 'path'
import { promisify } from 'util'
import { execFile } from 'child_process'
import { rm, mkdir } from 'fs/promises'

const ejecutar = promisify(execFile)

// ═══════════════════════════════════════
// ✰ SAITAMABOT • YOUTUBE MP3
// ✰ FAA API + YT-DLP FALLBACK
// ═══════════════════════════════════════

const API_URL = 'https://api-faa.my.id/faa/ytmp3'
const TMP_DIR = path.resolve('./tmp/saitamabot-ytmp3')
const MAX_ATTEMPTS = 3
const DOWNLOAD_TIMEOUT = 300000

// ═══════════════════════════════════════
// ✰ UTILIDADES
// ═══════════════════════════════════════

const esperar = ms =>
  new Promise(resolve => setTimeout(resolve, ms))

function limpiarNombre(nombre = 'audio') {
  return nombre
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180) || 'audio'
}

function esMP3(buffer) {
  if (!buffer || buffer.length < 5000) return false

  return (
    (
      buffer[0] === 0x49 &&
      buffer[1] === 0x44 &&
      buffer[2] === 0x33
    ) ||
    (
      buffer[0] === 0xff &&
      (buffer[1] & 0xe0) === 0xe0
    )
  )
}

function obtenerYouTubeURL(entrada) {
  entrada = entrada.trim()

  const idRegex = /^[a-zA-Z0-9_-]{11}$/

  if (idRegex.test(entrada)) {
    return `https://www.youtube.com/watch?v=${entrada}`
  }

  let url

  try {
    url = new URL(
      entrada.startsWith('http')
        ? entrada
        : `https://${entrada}`
    )
  } catch {
    throw new Error('Enlace de YouTube inválido.')
  }

  const host = url.hostname.toLowerCase()

  const dominios = [
    'youtube.com',
    'www.youtube.com',
    'm.youtube.com',
    'music.youtube.com',
    'youtu.be',
    'www.youtu.be'
  ]

  if (!dominios.includes(host)) {
    throw new Error('Solo se permiten enlaces de YouTube.')
  }

  let videoId = null

  if (host.includes('youtu.be')) {
    videoId = url.pathname.split('/')[1]
  } else {
    videoId =
      url.searchParams.get('v') ||
      url.pathname.match(
        /^\/(?:shorts|embed|live)\/([a-zA-Z0-9_-]{11})/
      )?.[1]
  }

  if (!videoId || !idRegex.test(videoId)) {
    throw new Error('No se pudo identificar el video.')
  }

  return `https://www.youtube.com/watch?v=${videoId}`
}

// ═══════════════════════════════════════
// ✰ PRIMERA API: FAA
// ═══════════════════════════════════════

async function obtenerFAA(youtubeUrl) {
  const response = await axios.get(API_URL, {
    params: {
      url: youtubeUrl
    },
    timeout: 60000,
    headers: {
      Accept: 'application/json',
      'User-Agent': 'SaitamaBot'
    },
    validateStatus: () => true
  })

  if (
    response.status < 200 ||
    response.status >= 300
  ) {
    throw new Error(`FAA HTTP ${response.status}`)
  }

  const json = response.data

  if (json?.status !== true) {
    throw new Error(
      json?.message || 'FAA no pudo procesar el video.'
    )
  }

  const info = json.result

  if (!info?.mp3) {
    throw new Error('FAA no devolvió el MP3.')
  }

  return {
    title: info.title || 'audio',
    download: info.mp3
  }
}

async function descargarFAA(url, destino) {
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 120000,
    maxRedirects: 5,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36 Chrome/131 Mobile Safari/537.36',
      Accept: 'audio/mpeg, audio/*, */*'
    },
    validateStatus: () => true
  })

  if (
    response.status < 200 ||
    response.status >= 300
  ) {
    throw new Error(`Descarga HTTP ${response.status}`)
  }

  const buffer = Buffer.from(response.data)

  if (!esMP3(buffer)) {
    throw new Error('Archivo MP3 inválido.')
  }

  await fs.promises.writeFile(destino, buffer)

  return buffer.length
}

// ═══════════════════════════════════════
// ✰ SEGUNDA OPCIÓN: YT-DLP + FFMPEG
// ═══════════════════════════════════════

async function descargarYTdlp(youtubeUrl) {
  const salida = path.join(
    TMP_DIR,
    `saitama-${Date.now()}-%(id)s.%(ext)s`
  )

  const { stdout } = await ejecutar(
    'yt-dlp',
    [
      '--no-playlist',
      '--no-warnings',
      '--no-progress',
      '--extract-audio',
      '--audio-format',
      'mp3',
      '--audio-quality',
      '0',
      '--output',
      salida,
      '--print',
      '%(title)s',
      '--print',
      'after_move:filepath',
      youtubeUrl
    ],
    {
      timeout: DOWNLOAD_TIMEOUT,
      maxBuffer: 5 * 1024 * 1024,
      windowsHide: true
    }
  )

  const lineas = stdout
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)

  if (lineas.length < 2) {
    throw new Error('yt-dlp no devolvió información del audio.')
  }

  const title = limpiarNombre(lineas[0])
  const archivo = path.resolve(lineas[lineas.length - 1])

  const stat = await fs.promises.stat(archivo)

  if (!stat.isFile() || stat.size < 5000) {
    throw new Error('yt-dlp generó un archivo inválido.')
  }

  const buffer = await fs.promises.readFile(archivo)

  if (!esMP3(buffer)) {
    throw new Error('FFmpeg no generó un MP3 válido.')
  }

  return {
    path: archivo,
    title,
    size: stat.size
  }
}

// ═══════════════════════════════════════
// ✰ PROCESAMIENTO PRINCIPAL
// ═══════════════════════════════════════

async function procesarYouTube(youtubeUrl) {
  await mkdir(TMP_DIR, { recursive: true })

  const destino = path.join(
    TMP_DIR,
    `faa-${Date.now()}.mp3`
  )

  // PRIMER INTENTO: FAA API

  try {
    const info = await obtenerFAA(youtubeUrl)

    for (
      let intento = 1;
      intento <= MAX_ATTEMPTS;
      intento++
    ) {
      try {
        const size = await descargarFAA(
          info.download,
          destino
        )

        return {
          path: destino,
          filename: `${limpiarNombre(info.title)}.mp3`,
          title: info.title,
          size
        }
      } catch (error) {
        await rm(destino, { force: true })

        if (intento === MAX_ATTEMPTS) {
          throw error
        }

        await esperar(1500)
      }
    }
  } catch {
    // CAMBIO INTERNO A YT-DLP
    // SIN AVISAR AL USUARIO
  }

  // SEGUNDO INTENTO: YT-DLP

  const resultado = await descargarYTdlp(youtubeUrl)

  return {
    ...resultado,
    filename: `${resultado.title}.mp3`
  }
}

// ═══════════════════════════════════════
// ✰ REACCIONES
// ═══════════════════════════════════════

async function reaccion(conn, m, emoji) {
  try {
    await conn.sendMessage(m.chat, {
      react: {
        text: emoji,
        key: m.key
      }
    })
  } catch {}
}

// ═══════════════════════════════════════
// ✰ HANDLER
// ═══════════════════════════════════════

const handler = async (
  m,
  {
    conn,
    args,
    usedPrefix,
    command
  }
) => {
  const entrada = args?.[0]

  if (!entrada) {
    return m.reply(
      `*༺═────── ✰ ──────═༻*\n` +
      `*༻ 𝚄𝚂𝙾 ✰*\n\n` +
      `*༻ ${usedPrefix + command} <URL o ID de YouTube>*\n` +
      `*༺═────── ✰ ──────═༻*`
    )
  }

  let youtubeUrl

  try {
    youtubeUrl = obtenerYouTubeURL(entrada)
  } catch (error) {
    return m.reply(`✰ ${error.message}`)
  }

  await reaccion(conn, m, '⏳')

  let resultado = null

  try {
    resultado = await procesarYouTube(youtubeUrl)

    const audio = await fs.promises.readFile(
      resultado.path
    )

    await conn.sendMessage(
      m.chat,
      {
        audio,
        mimetype: 'audio/mpeg',
        fileName: resultado.filename,
        ptt: false
      },
      {
        quoted: m
      }
    )

    await reaccion(conn, m, '✅')

  } catch (error) {
    console.error(
      '[YTMP3] Error:',
      error?.message || error
    )

    await reaccion(conn, m, '❌')

    await conn.sendMessage(
      m.chat,
      {
        text:
          '*༺═────── ✰ ──────═༻*\n' +
          '✘ No se pudo descargar el audio.\n' +
          'Intenta nuevamente más tarde.\n' +
          '*༺═────── ✰ ──────═༻*'
      },
      {
        quoted: m
      }
    )

  } finally {
    if (resultado?.path) {
      await rm(resultado.path, {
        force: true
      }).catch(() => {})
    }
  }
}

// ═══════════════════════════════════════
// ✰ CONFIGURACIÓN
// ═══════════════════════════════════════

handler.help = ['ytmp3 <url o ID>']
handler.tags = ['descargas']
handler.command = ['ytmp3']

export default handler
