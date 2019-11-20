# AWS SAML Sign-on

This is a very simple electron based app to allow generation of AWS credentials assuming a role via SAML SSO (see the relevant AWS documentation [here](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_providers_saml.html)). It was built for and tested against ForgeRock Access Manager 6.5, however should work for any web based SAML sign-in.

## Installation
Since the app is not yet configured to be packages (PRs welcome), it is necessary to build from source:

```bash
# Clone this repository
git clone https://github.com/RoryStokes/aws-saml-signon
# Go into the repository
cd aws-saml-signon
# Install dependencies
yarn
# Build the app
yarn build
# Symlink the executable script to anywhere in your PATH
sudo ln -s "$PWD/bin/aws-saml-signon.sh" /usr/bin/aws-saml-signon
```

## Configuration
The app must be configured before first use, using the `aws-saml-signon config` command. There are three settings to configure:
 - **Default AWS Profile** *(saml-signon)* - the AWS profile to store credentials against by default. When the `AWS_PROFILE` environment variable is present, that profile is updated instead.
 - **SSO URL** - the URL of the SAML sign-on website that is used to log in to your AWS account. This should be whatever link you would follow to access the AWS console using one of these roles (that redirects to https://signin.aws.amazon.com/saml after signing in).
 - **Seconds for generated credentials to remain valid** (3600) - this is the duration of the grant that you wish to request. Note that this can be up to 12 hours, but depends on the configuration of the role you are assuming.

These configuration settings are stored in `~/.config/configstore/aws-saml-signon.json`.
