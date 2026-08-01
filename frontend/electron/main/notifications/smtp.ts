import net from 'node:net'
import tls from 'node:tls'

export interface SmtpSendOptions {
  host: string
  port: number
  secure: boolean
  user?: string
  password?: string
  from: string
  to: string
  subject: string
  text: string
}

function encodeBase64(value: string) {
  return Buffer.from(value, 'utf8').toString('base64')
}

function readResponse(socket: net.Socket): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = ''
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString('utf8')
      // SMTP multiline ends when a line matches /^\d{3} /
      if (/(?:^|\n)\d{3} .+\r?\n$/.test(buffer)) {
        cleanup()
        resolve(buffer)
      }
    }
    const onError = (error: Error) => {
      cleanup()
      reject(error)
    }
    const onEnd = () => {
      cleanup()
      reject(new Error('SMTP connection closed'))
    }
    const cleanup = () => {
      socket.off('data', onData)
      socket.off('error', onError)
      socket.off('end', onEnd)
    }
    socket.on('data', onData)
    socket.on('error', onError)
    socket.on('end', onEnd)
  })
}

async function expectCode(socket: net.Socket, code: number) {
  const response = await readResponse(socket)
  if (!response.startsWith(String(code))) {
    throw new Error(`SMTP expected ${code}, got: ${response.trim().slice(0, 200)}`)
  }
  return response
}

async function writeLine(socket: net.Socket, line: string) {
  socket.write(`${line}\r\n`)
}

/**
 * Minimal SMTP client (AUTH LOGIN + optional STARTTLS) — no extra dependencies.
 */
export async function sendSmtpMail(options: SmtpSendOptions): Promise<void> {
  const host = options.host.trim()
  const to = options.to.trim()
  if (!host) throw new Error('SMTP host is required')
  if (!to) throw new Error('Email recipient is required')

  const connect = (): Promise<net.Socket> =>
    new Promise((resolve, reject) => {
      const socket = options.secure
        ? tls.connect({ host, port: options.port, servername: host }, () => resolve(socket))
        : net.connect({ host, port: options.port }, () => resolve(socket))
      socket.setTimeout(20_000)
      socket.once('error', reject)
      socket.once('timeout', () => {
        socket.destroy()
        reject(new Error('SMTP timeout'))
      })
    })

  let socket = await connect()
  try {
    await expectCode(socket, 220)
    await writeLine(socket, `EHLO azure-fast-board`)
    const ehlo = await expectCode(socket, 250)

    if (!options.secure && /STARTTLS/i.test(ehlo)) {
      await writeLine(socket, 'STARTTLS')
      await expectCode(socket, 220)
      socket = await new Promise<tls.TLSSocket>((resolve, reject) => {
        const secureSocket = tls.connect(
          { socket, servername: host },
          () => resolve(secureSocket),
        )
        secureSocket.once('error', reject)
      })
      await writeLine(socket, `EHLO azure-fast-board`)
      await expectCode(socket, 250)
    }

    if (options.user && options.password) {
      await writeLine(socket, 'AUTH LOGIN')
      await expectCode(socket, 334)
      await writeLine(socket, encodeBase64(options.user))
      await expectCode(socket, 334)
      await writeLine(socket, encodeBase64(options.password))
      await expectCode(socket, 235)
    }

    const from = options.from.trim() || options.user || 'azure-fast-board@localhost'
    await writeLine(socket, `MAIL FROM:<${from}>`)
    await expectCode(socket, 250)
    await writeLine(socket, `RCPT TO:<${to}>`)
    await expectCode(socket, 250)
    await writeLine(socket, 'DATA')
    await expectCode(socket, 354)

    const payload = [
      `From: ${from}`,
      `To: ${to}`,
      `Subject: ${options.subject.replace(/[\r\n]+/g, ' ')}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
      '',
      options.text,
      '.',
    ].join('\r\n')
    socket.write(`${payload}\r\n`)
    await expectCode(socket, 250)
    await writeLine(socket, 'QUIT')
  } finally {
    socket.end()
    socket.destroy()
  }
}
