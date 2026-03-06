declare module 'wink-nlp' {
  interface WinkSentences {
    out(): string[]
  }

  interface WinkDocument {
    sentences(): WinkSentences
  }

  interface WinkNlpInstance {
    readDoc(text: string): WinkDocument
  }

  export default function winkNLP(model: unknown): WinkNlpInstance
}

declare module 'wink-eng-lite-web-model' {
  const model: unknown
  export default model
}