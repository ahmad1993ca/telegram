## Fix for bs58 decode error

To resolve the `TypeError: bs58.decode is not a function` error:

1. We've updated the bs58 version in package.json from 6.0.0 to 4.0.1
2. You need to run the following command to apply the changes:

```bash
npm install
```

This will:
- Remove the old bs58 v6.0.0 installation
- Install bs58 v4.0.1 which has the decode function available
- Update your node_modules directory

After running this command, the code should work as expected.