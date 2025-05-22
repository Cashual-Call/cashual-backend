import { Request, Response } from "express";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v4 as uuidv4 } from "uuid";

export class UploadController {
  private s3Client: S3Client;

  constructor() {
    this.s3Client = new S3Client({
      region: process.env.AWS_REGION || "eu-north-1",
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
      },
    });

    this.getPresignedUrl = this.getPresignedUrl.bind(this);
  }

  async getPresignedUrl(req: Request, res: Response) {
    try {
      const fileExtension = "webp";
      const key = `${uuidv4()}.${fileExtension}`;
      
      const command = new PutObjectCommand({
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: key,
        ContentType: "image/webp",
      });

      const presignedUrl = await getSignedUrl(this.s3Client, command, {
        expiresIn: 3600, 
      });

      res.json({
        presignedUrl,
        key,
      });
    } catch (error) {
      console.error("Error generating presigned URL:", error);
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  }
}
