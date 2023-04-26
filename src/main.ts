import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Configuration, OpenAIApi } from 'openai';
import { createWriteStream } from 'fs';

import * as path from 'path';
const fs = require('fs-extra');
const { getWordsList } = require('most-common-words-by-language');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(3000);

  // todo improve (to put in relationship with embeddingsBatchSize and find the good "page size")
  const nbWords = 30; 
  await generateRandomWords(nbWords);
  const embeddingsBatchSize = 1000;

  const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const openai = new OpenAIApi(configuration);

  const files = await listFiles('src/input/');

  const outputPath = 'src/output/vectors.tsv';
  const metadataPath = 'src/output/metadata.tsv';
  const vectorFile = createWriteStream(outputPath);
  const metadataFile = createWriteStream(metadataPath);

  const embeddings: Array<EmbeddingResult> = [];
  let nbWordsProcessed = 0;
  let apiCalls = 0;

  while (nbWordsProcessed < nbWords)
  {
    const words: Array<string> = [];
    console.log('nbWordsProcessed:', nbWordsProcessed);
    console.log('embeddingsBatchSize:', embeddingsBatchSize);
    for (let i = nbWordsProcessed; i < embeddingsBatchSize+nbWordsProcessed; i++) {
      const fileContent = await fs.readFile(files[i]) //, 'utf-8');
      words.push(decodeURIComponent(fileContent));
      metadataFile.write(files[i].concat('\n').replace('src\\input\\', '').replace('.txt', ''));
    }

    const newEmbeddings = await getEmbeddings(openai, words);
    embeddings.push(...newEmbeddings);
    apiCalls += 1;
    console.log(`API call ${apiCalls}/${nbWords/embeddingsBatchSize} DONE!`);
    nbWordsProcessed += embeddingsBatchSize;
  }

  for (let i = 0; i < embeddings.length; i++) {
    vectorFile.write(embeddings[i].vector.join('\t').concat('\n'));
  }

  vectorFile.end();
  metadataFile.end();

  console.log('Wrote vectors to file', outputPath);
  console.log('Wrote vectors to file', metadataPath);
  console.log('You can now upload files to https://projector.tensorflow.org/');
}
bootstrap();

interface EmbeddingResult {
  vector: Array<number>;
}

async function getEmbeddings(openai: OpenAIApi, words: Array<string>)
: Promise<Array<EmbeddingResult>>
{
  let success = false;
  let nbAttempts = 0;
  let embeddings: Array<EmbeddingResult> = [];
  
  while (success === false && nbAttempts < 3)
  {
    nbAttempts += 1;
    try {
      const embedding = await openai.createEmbedding({
        model: 'text-embedding-ada-002',
        input: words,
    });
  
    for (let i = 0; i < embedding.data.data.length; i++) {
      const result = {
        vector: embedding.data.data[i].embedding,
      };
      embeddings.push(result)
      
    }

    } catch (error) {
      console.error(`There was an error calling openai API 
      (attempt ${nbAttempts}/3.)`);
    }

    success = true;
  }

  return embeddings;
}

async function listFiles(folder: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(folder, { withFileTypes: true });
    const files = entries.map((entry) => path.join(folder, entry.name));
    return files;
  } catch (err) {
    console.error(`Error listing files in folder "${folder}":`, err);
    throw err;
  }
}

async function generateRandomWords(number: number) {
  const fullPath = path.join(process.cwd(), 'src/input/');
  await fs.emptyDir(fullPath);

  const wordArray = getWordsList('english', number);

  for (const word of wordArray) {
    const fileName = `src\\input\\${word}.txt`;
    fs.writeFile(fileName, word);
  }

  console.log(`All files were written successfully(${number}) to ${fullPath}`);
}