import "server-only";

import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

type BunnyS3Config = {
  bucket: string;
  client: S3Client;
};

let cachedConfig: BunnyS3Config | undefined;

function requiredEnvironmentVariable(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function getBunnyS3Config(): BunnyS3Config {
  if (cachedConfig) return cachedConfig;

  const endpoint = requiredEnvironmentVariable("BUNNY_S3_ENDPOINT").replace(/\/$/, "");
  const region = requiredEnvironmentVariable("BUNNY_S3_REGION");
  const bucket = requiredEnvironmentVariable("BUNNY_S3_BUCKET");
  const accessKeyId = requiredEnvironmentVariable("BUNNY_S3_ACCESS_KEY_ID");
  const secretAccessKey = requiredEnvironmentVariable("BUNNY_S3_SECRET_ACCESS_KEY");

  cachedConfig = {
    bucket,
    client: new S3Client({
      endpoint,
      region,
      forcePathStyle: process.env.BUNNY_S3_FORCE_PATH_STYLE !== "false",
      requestChecksumCalculation: "WHEN_REQUIRED",
      credentials: { accessKeyId, secretAccessKey },
    }),
  };

  return cachedConfig;
}

export async function uploadPrivateObject(input: {
  key: string;
  body: Uint8Array;
  contentType: string;
}) {
  const { bucket, client } = getBunnyS3Config();
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: input.key,
    Body: input.body,
    ContentLength: input.body.byteLength,
    ContentType: input.contentType,
  }));
}

export async function deletePrivateObject(key: string) {
  const { bucket, client } = getBunnyS3Config();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

export async function getPrivateObject(key: string) {
  const { bucket, client } = getBunnyS3Config();
  const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!object.Body) throw new Error("Bunny S3 returned an empty object body.");
  return {
    bytes: await object.Body.transformToByteArray(),
    contentLength: object.ContentLength,
    contentType: object.ContentType,
  };
}
