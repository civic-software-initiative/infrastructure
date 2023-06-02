# CSI CDK Infrastructure

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## Useful commands

| Command                                        | Action                                            |
| :--------------------------------------------- | :------------------------------------------------ |
| `npm install`                                  | Install dependencies                              |
| `npm run build`                                | Compile typescript to js                          |
| `npm run watch`                                | Watch for changes and compile                     |
| `npm run test`                                 | Run the unit tests                                |
| `npm run cdk ...`                              | Run CLI commands                                  |
| `npm run format`                               | Format code with [prettier](https://prettier.io/) |
|                                                |                                                   |
| `cdk deploy --outputs-file cdk-outputs.json`   | Deploy to configured account/regions              |
| `cdk diff`                                     | Compare deployed stack with current state         |
| `cdk synth`                                    | Emits the synthesized CloudFormation template     |

## Ansible

Ansible is used to manage demo environments

```bash
$ cd ansible
$ ansible-playbook -i hosts.yml playbook.yml -u ubuntu
```
