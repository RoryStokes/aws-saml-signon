import { app, BrowserWindow, session } from "electron";
import { parseStringPromise } from "xml2js";
import * as inquirer from "inquirer";
import * as STS from "aws-sdk/clients/sts";
import Configstore = require("configstore");
import { promisify } from "util";
import { exec } from "child_process";
const execPromise = promisify(exec);

let mainWindow: Electron.BrowserWindow;

type Role = {
  roleArn: string;
  providerArn: string;
};

type Config = {
  ssoUrl: string;
  profile: string;
  credentialDurationSeconds: number;
};

const getAWSCredentials = async (payload: string, config: Config) => {
  const samlResponse = decodeURIComponent(payload.substring(13));
  const xml = Buffer.from(samlResponse, "base64").toString();
  const model = await parseStringPromise(xml);

  const assertions: any[] = model["samlp:Response"]["saml:Assertion"];

  const attributeStatements: any[] = assertions
    .map((a: any) => a["saml:AttributeStatement"])
    .reduce((a, b) => [...a, ...b]);

  const attributes: any[] = attributeStatements
    .map((a: any) => a["saml:Attribute"])
    .reduce((a, b) => [...a, ...b]);

  const roles: Role[] = attributes
    .find(
      (a: any) => a["$"].Name === "https://aws.amazon.com/SAML/Attributes/Role"
    )
    ["saml:AttributeValue"].map((r: any) => {
      const [roleArn, providerArn] = r["_"].split(",");
      return { roleArn, providerArn };
    });

  const result = await inquirer.prompt([
    {
      type: "list",
      name: "role",
      choices: roles.map(r => ({ name: r.roleArn, value: r })),
      message: "Choose a role to assume"
    }
  ]);

  const assumeRoleRequest: STS.AssumeRoleWithSAMLRequest = {
    RoleArn: result.role.roleArn,
    PrincipalArn: result.role.providerArn,
    SAMLAssertion: samlResponse,
    DurationSeconds: config.credentialDurationSeconds
  };

  const tokenService = new STS();
  const tokenResult = await tokenService
    .assumeRoleWithSAML(assumeRoleRequest)
    .promise();

  const output = {
    aws_access_key_id: tokenResult.Credentials.AccessKeyId,
    aws_secret_access_key: tokenResult.Credentials.SecretAccessKey,
    aws_session_token: tokenResult.Credentials.SessionToken
  };

  const awsProfile = process.env.AWS_PROFILE || config.profile;

  await Object.entries(output)
    .map(([k, v]) => `aws configure set ${k} ${v} --profile ${awsProfile}`)
    .reduce<Promise<any>>(
      (prev, command) => prev.then(() => execPromise(command)),
      Promise.resolve(null)
    );

  console.log(
    `Success! Your profile "${awsProfile}" should be ready to use.`
  );
};

function createWindow(config: Config) {
  mainWindow = new BrowserWindow({
    height: 650,
    width: 800
  });

  mainWindow.setMenu(null);
  mainWindow.setMenuBarVisibility(false);
  mainWindow.setTitle("Sign In");
  mainWindow.loadURL(config.ssoUrl);

  let samlCaptured = false;

  session.defaultSession.webRequest.onBeforeRequest(
    { urls: ["https://signin.aws.amazon.com/saml"] },
    async (details, cb) => {
      samlCaptured = true;
      mainWindow.close();
      await getAWSCredentials(details.uploadData[0].bytes.toString(), config);
      app.quit();
    }
  );

  mainWindow.on("closed", () => {
    mainWindow = null;
    if (!samlCaptured) {
      app.quit();
    }
  });
}

const config = new Configstore("aws-saml-signon", {
  profile: "saml-signon",
  credentialDurationSeconds: 3600
});

if (
  process.argv.length > 2 &&
  (process.argv[2] === "config" || process.argv[1] === "configure")
) {
  inquirer
    .prompt([
      {
        type: "input",
        name: "profile",
        default: config.get("profile"),
        message: "Default AWS Profile (when AWS_PROFILE is not set)"
      },
      {
        type: "input",
        name: "ssoUrl",
        default: config.get("ssoUrl"),
        message: "SSO URL"
      },
      {
        type: "number",
        name: "credentialDurationSeconds",
        default: parseInt(config.get("credentialDurationSeconds")),
        message: "Duration for generated credentials to remain valid (seconds)"
      }
    ])
    .then((newConfig: Config) => {
      config.set("profile", newConfig.profile);
      config.set("ssoUrl", newConfig.ssoUrl);
      config.set(
        "credentialDurationSeconds",
        newConfig.credentialDurationSeconds
      );
      app.quit();
    });
} else if (!config.get("ssoUrl")) {
  console.error(
    "You must configure your SSO provider URL.\n",
    "Usage: aws-saml-signon config"
  );
} else {
  app.on("ready", () => createWindow(config.all));

  app.on("window-all-closed", () => {
    // Override the default handler to keep the app running until
    // CLI interactions are finished.
  });
}
