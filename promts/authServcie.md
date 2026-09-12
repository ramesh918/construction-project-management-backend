In the notes folder make another folder called AuthService , now this folder to create APIs for auth service give the step by step instructions in .md files

East step.md file give the action steps in detail

```Shell
aws cognito-idp admin-create-user \
  --user-pool-id us-east-1_jh9UhHlrz \
  --username test@buildtrack.dev \
  --user-attributes Name=email,Value=test@buildtrack.dev Name=email_verified,Value=true \
  --temporary-password TempPass123!
```

```Shell
aws cognito-idp admin-set-user-password \
  --user-pool-id us-east-1_jh9UhHlrz \
  --username test@buildtrack.dev \
  --password RealPass123! \
  --permanent
```
