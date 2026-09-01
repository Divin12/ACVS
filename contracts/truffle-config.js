/**
 * Truffle configuration for the ACVS certificate registry.
 *
 * Local development targets a Ganache instance running on the default GUI
 * port. Start Ganache (GUI or `ganache-cli`) before running `truffle migrate`
 * or `truffle test --network development`.
 */
module.exports = {
  networks: {
    development: {
      host: "127.0.0.1",
      port: 7545,
      network_id: "*",
    },
  },

  contracts_directory: "./contracts",
  contracts_build_directory: "./build/contracts",
  migrations_directory: "./migrations",
  test_directory: "./test",

  compilers: {
    solc: {
      version: "0.8.20",
      settings: {
        optimizer: {
          enabled: true,
          runs: 200,
        },
      },
    },
  },
};
