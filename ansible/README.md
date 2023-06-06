# DemoEnvironments

[Ansible](https://docs.ansible.com/ansible/latest/index.html) is used to manage demo environments.
Update hosts in hosts.yml.

```bash
ansible-playbook -i hosts.yml playbook.yml -u ubuntu
```

Demo environments are built with:
- [docker](https://docs.docker.com/)
  - postgresql running in docker
- [asdf](https://asdf-vm.com/guide/introduction.html)
  - version manager for installing prereq programming languages
- [traefik](https://doc.traefik.io/traefik/)
  - load balancer, routes traffic and provides ssl termination
  - update targets in `roles/traefik/templates/config.yml.j2`
