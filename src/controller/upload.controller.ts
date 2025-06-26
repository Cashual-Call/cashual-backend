import { Request, Response } from "express";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v4 as uuidv4 } from "uuid";

export class UploadController {
  private s3Client: S3Client;

  private tempBucketName: string = process.env.AWS_TEMP_BUCKET_NAME as string;
  private bucketName: string = process.env.AWS_BUCKET_NAME as string;

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
      const fileExtension = req.params.extension as string || "webp";
      const key = `${uuidv4()}.${fileExtension}`;
      
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        ContentType: `image/${fileExtension}`,
      });

      const presignedUrl = await getSignedUrl(this.s3Client, command, {
        expiresIn: 3600, 
      });

      res.json({
        presignedUrl,
        key,
        url: `https://${this.bucketName}.s3.amazonaws.com/${key}`,
      });
    } catch (error) {
      console.error("Error generating presigned URL:", error);
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  }
}
