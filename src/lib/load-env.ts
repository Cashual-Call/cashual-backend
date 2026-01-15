import { SSMClient, GetParametersByPathCommand } from "@aws-sdk/client-ssm";

const client = new SSMClient({
  region: process.env.AWS_REGION || "eu-north-1",
});

export async function loadSSMParams() {
  const command = new GetParametersByPathCommand({
    Path: "/myapp/prod",
    WithDecryption: true,
    Recursive: true,
  });

  const { Parameters } = await client.send(command);

  if (!Parameters) {
    throw new Error("No SSM parameters found");
  }

  for (const param of Parameters) {
    if (!param.Name || !param.Value) continue;

    const key = param.Name.split("/").pop();
    if (!key) continue;

    process.env[key] = param.Value;
  }
}
