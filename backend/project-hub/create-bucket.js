const { S3Client, CreateBucketCommand } = require("@aws-sdk/client-s3");

const client = new S3Client({
  endpoint: "http://localhost:8333",
  region: "us-east-1",
  credentials: { accessKeyId: "admin", secretAccessKey: "secret" },
  forcePathStyle: true
});

client.send(new CreateBucketCommand({ Bucket: "project-hub-attachments" }))
  .then(() => console.log("✅ Bucket 'project-hub-attachments' created successfully!"))
  .catch((err) => console.error("❌ Error:", err.message));