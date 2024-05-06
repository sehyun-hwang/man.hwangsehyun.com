from glob import glob

import boto3

BUCKET = "man.hwangsehyun.com"
s3 = boto3.client("s3")

for file in glob("public/**/index.html", recursive=True):
    file = file.removeprefix("public/")
    key = file.removesuffix("index.html")
    print(file, key)
    if not key:
        continue

    s3.copy_object(
        CopySource={
            "Bucket": BUCKET,
            "Key": file,
        },
        Bucket=BUCKET,
        Key=key,
    )
