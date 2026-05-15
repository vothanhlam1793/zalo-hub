const { Client } = require("minio");

const mc = new Client({
  endPoint: "localhost",
  port: 9000,
  useSSL: false,
  accessKey: "zalohub",
  secretKey: "zalohub-minio-secret",
});

mc.bucketExists("zalohub-media", (err, exists) => {
  if (err) { console.log("Check err:", err.message); process.exit(1); }
  if (exists) { console.log("Bucket exists"); process.exit(0); }
  mc.makeBucket("zalohub-media", (err2) => {
    if (err2) { console.log("Create err:", err2.message); process.exit(1); }
    console.log("Bucket created");
    process.exit(0);
  });
});
