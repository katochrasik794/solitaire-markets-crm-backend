import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

// Base64 encoded Solitaire logo SVG (from public/logo.svg)
// This ensures the logo displays in emails even when external images are blocked
const LOGO_SVG_BASE64 = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzE2IiBoZWlnaHQ9IjExMCIgdmlld0JveD0iMCAwIDMxNiAxMTAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHBhdGggZD0iTTg2LjgyOTUgNjQuNDA0N0M4My41MDMgNzcuOTMwNCA1NC4zOTM5IDgyLjE0MTkgNDYuNzcxOCA4My4zNjUyQzM0LjUzMSA4NS4zMTM3IDI1LjkyMjMgODcuODMwMSAxNC40NDEgOTcuNDE1MkMzLjY4NDQ3IDEwNi40MzIgMC4zNTc5NyAxMDkuMDk3IDAgMTA5LjM1OUw1NC4wNzA5IDU0Ljg2MzJDNjEuNzU0MiA0Ny4xNzQyIDY4LjcyMTUgNDAuMjAxNiA3MS41NDE2IDM3LjIyMjFDNzkuNDc4IDI4LjgxNjUgNjQuMjU5OSAzMC42MDc3IDU2LjY4MTUgMzIuMDkzMUM0OC40MzA3IDMzLjczNTggMzMuMjIxMyAzNi41NTggMjguMjk3MSA0NC41NTI5QzI0LjkxODIgNTAuMDQwMSAzNi4wMzI3IDU3Ljg4NjQgNTIuMDcxNSA1NS40MjI0QzUwLjA3MjEgNTUuNzg5NCAzOS43MjU5IDU3LjUyODIgMzIuMTM4NyA1NS42ODQ2QzI2LjI5NzcgNTQuMzA0IDIyLjgxNCA0OS40Mjg1IDIzLjk0MDMgNDQuOTYzNkMyNy4yNzU2IDMxLjQyOTEgNTYuMzc1OSAyNy4yMjYzIDYzLjk5OCAyNS45OTQzQzc2LjIzODggMjQuMDQ1OCA4NC44NDc2IDIxLjUzODEgOTYuMzI4OCAxMS45NDQzQzEwNy4wODUgMi45MTgzNSAxMTAuNDEyIDAuMjUzMzkgMTEwLjc3IDBMNTYuNzI1MSA1NC40NTI2QzQ5LjA0MTkgNjIuMTQxNiA0Mi4wNDg0IDY5LjE2NjcgMzkuMjI4MyA3Mi4xMzc0QzMxLjI5MTggODAuNTQzIDQ2LjUwOTkgNzguNzUxOCA1NC4wODg0IDc3LjI2NjRDNjIuMzM5MSA3NS42MjM3IDc3LjU0ODUgNzIuODEwMiA4Mi40NzI3IDY0LjgwNjZDODUuODUxNiA1OS4zMTk0IDc0LjczNzEgNTEuNDczMSA1OC43MDcgNTMuOTM3QzYwLjcwNjQgNTMuNTc4OCA3MS4wNTI2IDUxLjgzMTMgNzguNjMxMSA1My42ODM3Qzg0LjQ3MjEgNTUuMDY0MiA4Ny45NTU4IDU5LjkzMSA4Ni44Mjk1IDY0LjQwNDdaIiBmaWxsPSIjMDgxNDI4Ii8+PHBhdGggZD0iTTExMy42MTYgODAuMDc5OUMxMTAuNTk1IDgwLjA3OTkgMTA3LjgwMSA3OS41MjA2IDEwNS4yMzQgNzguMzkzNUMxMDIuNjU5IDc3LjI3NTEgMTAwLjQzMiA3NS43Mjg1IDk4LjUzNzcgNzMuNzUzOEM5Ni42NDMxIDcxLjc3OTEgOTUuMTY3NiA2OS40ODEyIDk0LjEwMjQgNjYuODQyNEM5My4wMzcyIDY0LjIwMzcgOTIuNTA0NiA2MS4zNjQgOTIuNTA0NiA1OC4zMDU4QzkyLjUwNDYgNTUuMjQ3NyA5My4wMzcyIDUyLjQxNjcgOTQuMTAyNCA0OS44MDQxQzEwNS4xNjc2IDQ3LjE5MTYgOTYuNjQzMSA0NC45MDI0IDk4LjUzNzcgNDIuOTI3N0MxMDAuNDMyIDQwLjk1MyAxMDIuNjY3IDM5LjQxNTIgMTA1LjIzNCAzOC4zMTQyQzEwNy44MDEgMzcuMjEzMyAxMTAuNTk1IDM2LjY2MjggMTEzLjYxNiAzNi42NjI4QzExNi42MzcgMzYuNjYyOCAxMTkuNDEzIDM3LjIxMzMgMTIxLjk3MiAzOC4zMTQyQzEyNC41MjEgMzkuNDE1MiAxMjYuNzU2IDQwLjk1MyAxMjguNjY4IDQyLjkyNzdDMTMwLjU4IDQ0LjkwMjQgMTMyLjA2NSA0Ny4xOTE2IDEzMy4xMDQgNDkuODA0MUMxMzQuMTQzIDUyLjQxNjcgMTM0LjY2NiA1NS4yNTY0IDEzNC42NjYgNTguMzA1OEMxMzQuNjY2IDYxLjM1NTIgMTM0LjE0MyA2NC4yMDM3IDEzMy4xMDQgNjYuODQyNEMxMzIuMDY1IDY5LjQ4MTIgMTMwLjU4IDcxLjc3OTEgMTI4LjY2OCA3My43NTM4QzEyNi43NTYgNzUuNzI4NSAxMjQuNTIxIDc3LjI3NTEgMTIxLjk3MiA3OC4zOTM1QzExOS40MjIgNzkuNTExOSAxMTYuNjM3IDgwLjA3OTkgMTEzLjYxNiA4MC4wNzk5Wk0xMTMuNjE2IDc1LjM3OUMxMTUuOTM5IDc1LjM3OSAxMTguMDUxIDc0LjkzMzQgMTE5Ljk2NCA3NC4wNDIyQzEyMS44NzYgNzMuMTUxIDEyMy41MjYgNzEuOTM2NCAxMjQuOTIzIDcwLjM4OTlDMTI2LjMxMSA2OC44NDMzIDEyNy4zNzYgNjcuMDM0NiAxMjguMTEgNjQuOTYzOEMxMjguODQzIDYyLjg5MyAxMjkuMjEgNjAuNjgyNCAxMjkuMjEgNTguMzE0NkMxMjkuMjEgNTUuOTQ2NyAxMjguODQzIDUzLjczNiAxMjguMTEgNTEuNjY1MkMxMjcuMzc2IDQ5LjU5NDQgMTI2LjMxMSA0Ny43OTQ1IDEyNC45MjMgNDYuMjY1NEMxMjMuNTI2IDQ0LjczNjQgMTIxLjg3NiA0My41MzkzIDExOS45NjQgNDIuNjY1NkMxMTguMDUxIDQxLjc5MTggMTE1LjkzIDQxLjM2MzcgMTEzLjYxNiA0MS4zNjM3QzExMS4zMDIgNDEuMzYzNyAxMDkuMTIgNDEuODAwNSAxMDcuMjA4IDQyLjY2NTZDMTA1LjI5NiA0My41MzkzIDEwMy42NTQgNDQuNzM2NCAxMDIuMjc1IDQ2LjI2NTRDMTAwLjkwNCA0Ny43OTQ1IDk5LjgzODcgNDkuNTk0NCA5OS4wODc4IDUxLjY2NTJDOTguMzM2OSA1My43MzYgOTcuOTYxNSA1NS45NTU0IDk3Ljk2MTUgNTguMzE0NkM5Ny45NjE1IDYwLjY3MzcgOTguMzM2OSA2Mi44OTMgOTkuMDg3OCA2NC45NjM4Qzk5LjgzODcgNjcuMDM0NiAxMDAuOTA0IDY4Ljg0MzMgMTAyLjI3NSA3MC4zODk5QzEwMy42NDUgNzEuOTM2NCAxMDUuMjg3IDczLjE1OTcgMTA3LjIwOCA3NC4wNDIyQzEwOS4xMiA3NC45MzM0IDExMS4yNTkgNzUuMzc5IDExMy42MTYgNzUuMzc5WiIgZmlsbD0iIzA4MTQyOCIvPjxwYXRoIGQ9Ik0xNjMuMDQyIDc5LjIxNDhIMTM4LjYyMlYzNy41MzY2SDE0My45MDRWNzQuNTE0SDE2My4wNDJWNzkuMjE0OFoiIGZpbGw9IiMwODE0MjgiLz48cGF0aCBkPSJNMTcxLjc5OSA3OS4yMTQ4SDE2Ni41MTdWMzcuNTM2NkgxNzEuNzk5Vjc5LjIxNDhaIiBmaWxsPSIjMDgxNDI4Ii8+PHBhdGggZD0iTTE5My42NjIgNzkuMjE0OEgxODguMzg4VjQyLjIzNzRIMTc0LjU4NFYzNy41MzY2SDIwNy40MTNWNDIuMjM3NEgxOTMuNjYyVjc5LjIxNDhaIiBmaWxsPSIjMDgxNDI4Ii8+PHBhdGggZD0iTTIzNS40ODMgNzkuMjE0OEwyMjIuMDI5IDQzLjIyNDhMMjA4LjQ1MiA3OS4yMTQ4SDIwMy4yMzFMMjE5LjI5NiAzNy41MzY2SDIyNS4wOTNMMjQxLjA0NSA3OS4yMTQ4SDIzNS40NzRIMjM1LjQ4M1pNMjEyLjM0NiA2My45NDE2SDIzMi4xMjJMMjMzLjU3MSA2OC4xNzkzSDIxMC40MjVMMjEyLjMzNyA2My45NDE2SDIxMi4zNDZaIiBmaWxsPSIjMDgxNDI4Ii8+PHBhdGggZD0iTTI0OS40NjEgNzkuMjE0OEgyNDQuMTc5VjM3LjUzNjZIMjQ5LjQ2MVY3OS4yMTQ4WiIgZmlsbD0iIzA4MTQyOCIvPjxwYXRoIGQ9Ik0yNjEuMDY1IDc5LjIxNDhIMjU1Ljc4MlYzNy41MzY2SDI3MC45MjJDMjc1LjUyMyAzNy41MzY2IDI3OS4xMzggMzguNjQ2MyAyODEuNzY2IDQwLjg3NDRDMjg0LjM5NCA0My4xMDI1IDI4NS43MTIgNDYuMjQ4IDI4NS43MTIgNTAuMzExQzI4NS43MTIgNTMuMzY5MSAyODQuNzg3IDU1Ljk5MDQgMjgyLjkyNyA1OC4xNzQ4QzI4MS4wNjcgNjAuMzU5MiAyNzguNTE4IDYxLjc2NTkgMjc1LjI3IDYyLjM4NjNMMjg2LjgxMiA3OS4yMjM2SDI4MC41NDNMMjY5LjcgNjMuMDg1M0gyNjEuMDU2Vjc5LjIyMzZMMjYxLjA2NSA3OS4yMTQ4Wk0yNjEuMDY1IDQxLjk0OTFWNTguNjY0MUgyNzAuNTJDMjczLjYxMSA1OC42NjQxIDI3Ni4wMyA1Ny45NTYzIDI3Ny43NjcgNTYuNTQ5NkMyNzkuNTA1IDU1LjE0MjggMjgwLjM3OCA1My4wNTQ2IDI4MC4zNzggNTAuMzExQzI4MC4zNzggNDcuNTY3NCAyNzkuNTA1IDQ1LjUzMTUgMjc3Ljc2NyA0NC4wOTg1QzI3Ni4wMyA0Mi42NjU2IDI3My42MTEgNDEuOTQ5MSAyNzAuNTIgNDEuOTQ5MUgyNjEuMDY1WiIgZmlsbD0iIzA4MTQyOCIvPjxwYXRoIGQ9Ik0zMTUuOTkxIDc0LjYyNzZWNzkuMjE0OEgyOTAuNDFWMzcuNTM2NkgzMTUuNTgxVjQyLjEyMzhIMjk1LjY4M1Y1NS40MTM3SDMxMy44OTZWNjAuMDAwOUgyOTUuNjgzVjc0LjYyNzZIMzE1Ljk4M0gzMTUuOTkxWiIgZmlsbD0iIzA4MTQyOCIvPjxwYXRoIGQ9Ik0yNDMuMDYxIDEwOS4xNjdMMjM4Ljc5MiA5OC43OTU3VjEwOS4xNjdIMjM2LjY5N1Y5NS4yMjJIMjM5LjUwOEwyNDQuMDQ4IDEwNi4zNTRMMjQ4LjU4OCA5NS4yMjJIMjUxLjRWMTEwOS4xNjdIMjQ5LjI4N1Y5OC43NTJMMjQ1IDEwOS4xNjdIMjQzLjA2MVoiIGZpbGw9IiMwODE0MjgiLz48cGF0aCBkPSJNMjYxLjQwNSAxMDkuMTY3VjEwNy42MjlDMjYxLjA4MiAxMDguMTg5IDI2MC42NDYgMTA4LjYxNyAyNjAuMDk1IDEwOC45MTRDMjU5LjU0NSAxMDkuMjExIDI1OC44OTEgMTA5LjM1OSAyNTguMTQ4IDEwOS4zNTlDMjU3LjA3NSAxMDkuMzU5IDI1Ni4yMSAxMDkuMDcxIDI1NS41NjQgMTA4LjUwM0MyNTQuOTE4IDEwNy45MzUgMjU0LjU5NSAxMDcuMTc1IDI1NC41OTUgMTA2LjIzMUMyNTQuNTk1IDEwNS4yMTggMjU0Ljk5NyAxMDQuNDU4IDI1NS43OTEgMTAzLjkzM0MyNTYuNTg2IDEwMy40MDkgMjU3Ljc0NyAxMDMuMTQ3IDI1OS4yNzUgMTAzLjE0N0MyNTkuNTcyIDEwMy4xNDcgMjU5Ljg2IDEwMy4xNTYgMjYwLjE0OCAxMDMuMTczQzI2MC40MzYgMTAzLjE5MSAyNjAuNzY4IDEwMy4yMjYgMjYxLjE2MSAxMDMuMjYxVjEwMi41NDRDMjYxLjE2MSAxMDEuODQ1IDI2MC45NzcgMTAxLjMwMyAyNjAuNjExIDEwMC45MUMyNjAuMjQ0IDEwMC41MjYgMjU5LjcyOSAxMDAuMzI1IDI1OS4wNjUgMTAwLjMyNUMyNTguNDAyIDEwMC4zMjUgMjU3Ljg1MiAxMDAuNTE3IDI1Ny40NDEgMTAwLjkxQzI1Ny4wMzEgMTAxLjMwMyAyNTYuODEzIDEwMS44NDUgMjU2Ljc4NiAxMDIuNTQ0SDI1NC44NjZDMjU0LjkwMSAxMDEuNzU4IDI1NS4xMDEgMTAxLjA2NyAyNTUuNDU5IDEwMC40ODJDMjU1LjgxNyA5OS44OTY2IDI1Ni4zMDYgOTkuNDUxIDI1Ni45MjYgOTkuMTM2NEMyNTcuNTQ2IDk4LjgyMTkgMjU4LjI2MiA5OC42NjQ2IDI1OS4wODMgOTguNjY0NkMyNjAuMzY2IDk4LjY2NDYgMjYxLjM2MSA5OS4wMTQxIDI2Mi4wNzcgOTkuNzA0NEMyNjIuNzkzIDEwMC4zOTUgMjYzLjE1MSAxMDEuMzU2IDI2My4xNTEgMTAyLjU4OFYxMDkuMTc2SDI2MS40MDVWMTA5LjE2N1pNMjU2LjU5NCAxMDYuMTc5QzI1Ni41OTQgMTA2LjY4NiAyNTYuNzY5IDEwNy4wOTYgMjU3LjEyNyAxMDcuNDAyQzI1Ny40ODUgMTA3LjcxNyAyNTcuOTU2IDEwNy44NjUgMjU4LjU1IDEwNy44NjVDMjU5LjM1MyAxMDcuODY1IDI1OS45OTEgMTA3LjYzOCAyNjAuNDUzIDEwNy4xOTJDMjYwLjkxNiAxMDYuNzQ3IDI2MS4xNTIgMTA2LjE0NCAyNjEuMTUyIDEwNS4zNzVWMTA0LjU4QzI2MC43ODUgMTA0LjUyOCAyNjAuNDcxIDEwNC40OTMgMjYwLjE5MiAxMDQuNDg0QzI1OS45MTIgMTA0LjQ3NSAyNTkuNjQxIDEwNC40NjYgMjU5LjM4OCAxMDQuNDY2QzI1OC40NTQgMTA0LjQ2NiAyNTcuNzU2IDEwNC42MDYgMjU3LjI5MyAxMDQuODg2QzI1Ni44MyAxMDUuMTY1IDI1Ni41OTQgMTA1LjU5NCAyNTYuNTk0IDEwNi4xNzlaIiBmaWxsPSIjMDgxNDI4Ii8+PHBhdGggZD0iTTI2OC43ODMgMTAzLjk0MlYxMDkuMTY3SDI2Ni42N1Y5OC44NDgxSDI2OC42MzRWMTAwLjk4OUMyNjkuMDAxIDEwMC4yOTkgMjY5LjU0MiA5OS43NDgxIDI3MC4yNjcgOTkuMzM3NEMyNzAuOTkyIDk4LjkyNjcgMjcxLjc3OCA5OC43MTcgMjcyLjYxNiA5OC43MTdWMTAwLjkxQzI3MS44ODIgMTAwLjg3NSAyNzEuMjE5IDEwMC45NDUgMjcwLjY0MyAxMDEuMTQ2QzI3MC4wNjYgMTAxLjMzOCAyNjkuNjEyIDEwMS42NjIgMjY5LjI4IDEwMi4xMTZDMjY4Ljk0OSAxMDIuNTcgMjY4Ljc4MyAxMDMuMTgyIDI2OC43ODMgMTAzLjk0MloiIGZpbGw9IiMwODE0MjgiLz48cGF0aCBkPSJNMjc3LjIwOCAxMDkuMTY3SDI3NS4wOTVWOTUuMjIySDI3Ny4yMDhWMTAzLjQxOEwyODEuNDk1IDk4Ljg0ODFIMjgzLjk0TDI3OS4yNzcgMTAzLjgzN0wyODQuNDIgMTA5LjE1OEgyODEuNzA1TDI3Ny4yIDEwNC4zVjEwOS4xNThMMjc3LjIwOCAxMDkuMTY3WiIgZmlsbD0iIzA4MTQyOCIvPjxwYXRoIGQ9Ik0yOTAuNTIzIDEwOS4zNjhDMjg5LjUyOCAxMDkuMzY4IDI4OC42NTUgMTA5LjE0MSAyODcuOTA0IDEwOC42ODdDMjg3LjE1MyAxMDguMjMyIDI4Ni41NjggMTA3LjU5NCAyODYuMTQ5IDEwNi43ODJDMjg1LjczIDEwNS45NjkgMjg1LjUyIDEwNS4wMTcgMjg1LjUyIDEwMy45NDJDMjg1LjUyIDEwMi45MjkgMjg1LjczIDEwMi4wMjkgMjg2LjE1OCAxMDEuMjMzQzI4Ni41ODUgMTAwLjQzOCAyODcuMTcgOTkuODA5MiAyODcuOTIxIDk5LjM0NjFDMjg4LjY3MiA5OC44ODMgMjg5LjUxOSA5OC42NTU4IDI5MC40NjIgOTguNjU1OEMyOTEuMjQ4IDk4LjY1NTggMjkxLjk1NSA5OC44MDQ0IDI5Mi41ODMgOTkuMDkyN0MyOTMuMjEyIDk5LjM4MSAyOTMuNzQ1IDk5Ljc5MTcgMjk0LjE3MyAxMDAuMzI1QzI5NC42MDkgMTAwLjg1OCAyOTQuOTIzIDEwMS40NzggMjk1LjExNSAxMDIuMjAzQzI5NS4zMDggMTAyLjkyIDI5NS4zNiAxMDMuNjk3IDI5NS4yNzMgMTA0LjUyN0gyODYuNzM0VjEwMy4xNDdIMjkzLjAyQzI5Mi45OTQgMTAyLjIzOCAyOTIuNzQxIDEwMS41MyAyOTIuMjY5IDEwMS4wMDZDMjkxLjc5OCAxMDAuNDgyIDI5MS4xNzggMTAwLjIyOSAyOTAuNDE4IDEwMC4yMjlDMjg5Ljg1MSAxMDAuMjI5IDI4OS4zNTMgMTAwLjM3NyAyODguOTQzIDEwMC42NzRDMjg4LjUzMiAxMDAuOTcxIDI4OC4yMDkgMTAxLjM5OSAyODcuOTgyIDEwMS45NTBDMjg3Ljc1NSAxMDIuNSAyODcuNjQyIDEwMy4xNjQgMjg3LjY0MiAxMDMuOTQyQzI4Ny42NDIgMTA0LjcyIDI4Ny43NTUgMTA1LjQxIDI4Ny45NzQgMTA1Ljk2OUMyODguMTkyIDEwNi41MzcgMjg4LjUxNSAxMDYuOTY1IDI4OC45NDMgMTA3LjI2MkMyODkuMzcxIDEwNy41NTkgMjg5Ljg3NyAxMDcuNzA4IDI5MC40NzkgMTA3LjcwOEMyOTEuMTc4IDEwNy43MDggMjkxLjc2MyAxMDcuNTMzIDI5Mi4yMzQgMTA3LjE3NUMyOTIuNzA2IDEwNi44MTcgMjkzLjAyIDEwNi4zMTkgMjkzLjE3NyAxMDUuNjcySDI5NS4yNzNDMjk1LjAwMiAxMDYuODI1IDI5NC40NDMgMTA3LjcyNSAyOTMuNjE0IDEwOC4zODFDMjkyLjc4NCAxMDkuMDM2IDI5MS43NDUgMTA5LjM1OSAyOTAuNTE0IDEwOS4zNTlMMjkwLjUyMyAxMDkuMzY4WiIgZmlsbD0iIzA4MTQyOCIvPjxwYXRoIGQ9Ik0zMDQuMTM1IDEwNy4xMTRWMTA4Ljk3NUMzMDMuODM4IDEwOS4xMTUgMzAzLjU0MSAxMDkuMjIgMzAzLjI1MyAxMDkuMjcyQzMwMi45NjUgMTA5LjMzMyAzMDIuNjUgMTA5LjM1OSAzMDIuMzEgMTA5LjM1OUMzMDEuNjY0IDEwOS4zNTkgMzAxLjA5NiAxMDkuMjM3IDMwMC41OTkgMTA5LjAwMUMzMDAuMTAxIDEwOC43NjUgMjk5LjcyNSAxMDguMzkgMjk5LjQ1NSAxMDcuODkyQzI5OS4xODQgMTA3LjM5MyAyOTkuMDQ0IDEwNi43NjQgMjk5LjA0NCAxMDUuOTk1VjEwMC42NTdIMjk2LjgwOVY5OC44NDgxSDI5OS4wNDRWOTUuNzk4N0gzMDEuMTRWOTguODQ4MUgzMDQuMjMxVjEwMC42NTdIMzAxLjE0VjEwNS41MzJDMzAxLjE0IDEwNi4yMjMgMzAxLjI4OCAxMDYuNzAzIDMwMS41OTQgMTA2Ljk4M0MzMDEuODk5IDEwNy4yNjIgMzAyLjMxIDEwNy40MDIgMzAyLjgyNSAxMDcuNDAyQzMwMy4wNjkgMTA3LjQwMiAzMDMuMjk2IDEwNy4zNzYgMzAzLjUxNSAxMDcuMzMyQzMwMy43MjQgMTA3LjI4OSAzMDMuOTM0IDEwNy4yMSAzMDQuMTI2IDEwNy4xMDVMMzA0LjEzNSAxMDcuMTE0WiIgZmlsbD0iIzA4MTQyOCIvPjxwYXRoIGQ9Ik0zMTUuMjQgMTA2LjAzOUMzMTUuMjQgMTA3LjA2MSAzMTQuODY1IDEwNy44NzQgMzE0LjEwNSAxMDguNDY4QzMxMy4zNDYgMTA5LjA2MiAzMTIuMjgxIDEwOS4zNTkgMzEwLjg5MiAxMDkuMzU5QzMwOS41MDQgMTA5LjM1OSAzMDguNDIxIDEwOS4wMzYgMzA3LjYyNyAxMDguMzk4QzMwNi44NDEgMTA3Ljc2IDMwNi4zOTYgMTA2Ljg4NyAzMDYuMzA5IDEwNS43ODZIMzA4LjMyNUMzMDguMzUyIDEwNi4zOTcgMzA4LjU5NiAxMDYuODc4IDMwOS4wNzYgMTA3LjI0NUMzMDkuNTQ4IDEwNy42MTIgMzEwLjE1OSAxMDcuNzg3IDMxMC45MSAxMDcuNzg3QzMxMS41NzMgMTA3Ljc4NyAzMTIuMTA2IDEwNy42NzMgMzEyLjUwOCAxMDcuNDM3QzMxMi45MTggMTA3LjIwMSAzMTMuMTE5IDEwNi44NTIgMzEzLjExOSAxMDYuMzg5QzMxMy4xMTkgMTA1Ljk4NyAzMTIuOTc5IDEwNS42ODEgMzEyLjcwOCAxMDUuNDhDMzEyLjQzOCAxMDUuMjcgMzExLjk5MiAxMDUuMTEzIDMxMS4zOSAxMDQuOTkxTDMwOS42NzkgMTA0LjY3NkMzMDguNzM2IDEwNC40OTMgMzA4LjAwMiAxMDQuMTYxIDMwNy40ODcgMTAzLjY2M0MzMDYuOTcyIDEwMy4xNzMgMzA2LjcxIDEwMi41MzUgMzA2LjcxIDEwMS43NThDMzA2LjcxIDEwMS4xNDYgMzA2Ljg3NiAxMDAuNjEzIDMwNy4yMDggMTAwLjE0MUMzMDcuNTQgOTkuNjY5NSAzMDguMDAyIDk5LjMxMTIgMzA4LjYwNSA5OS4wNDAzQzMwOS4yMDcgOTguNzcwNSAzMDkuOTE0IDk4LjYzODQgMzEwLjcyNiA5OC42Mzg0QzMxMS41MzggOTguNjM4NCAzMTIuMjg5IDk4Ljc3ODIgMzEyLjkxOCA5OS4wNTc4QzMxMy41NTUgOTkuMzM3NCAzMTQuMDUzIDk5LjczOTMgMzE0LjQyOCAxMDAuMjY0QzMxNC44MDQgMTAwLjc4OCAzMTUuMDEzIDEwMS40MDggMzE1LjA2NiAxMDIuMTE2SDMxMy4wNDlDMzEzLjAwNyAxMDEuNTIyIDMxMi43NjEgMTAxLjA1IDMxMi4zNSAxMDAuNzE4QzMxMS45NCAxMDAuMzc3IDMxMS4zOSAxMDAuMjExIDMxMC43MTggMTAwLjIxMUMzMTAuMTI0IDEwMC4yMTEgMzA5LjY0NCAxMDAuMzM0IDMwOS4yNzcgMTAwLjU2OUMzMDguOTEgMTAwLjgwNSAzMDguNzM2IDEwMS4xMzcgMzA4LjczNiAxMDEuNTQ4QzMwOC43MzYgMTAxLjk1OSAzMDguODY3IDEwMi4yNDcgMzA5LjEzNyAxMDIuNDQ4QzMwOS4zOTkgMTAyLjY0OSAzMDkuODM2IDEwMi44MDYgMzEwLjQzIDEwMi45MkwzMTIuMjExIDEwMy4yNTJDMzEzLjIzMiAxMDMuNDQ0IDMxMy45OTIgMTAzLjc2NyAzMTQuNDgxIDEwNC4yMjJDMzE0Ljk3IDEwNC42NzYgMzE1LjIxNCAxMDUuMjcgMzE1LjIxNCAxMDYuMDEzTDMxNS4yNCAxMDYuMDM5WiIgZmlsbD0iIzA4MTQyOCIvPjwvc3ZnPg==';


// Helper function to get logo URL - returns actual URL for email templates
export const getLogoUrl = () => {
  // If LOGO_URL is explicitly set, use it
  if (process.env.LOGO_URL) {
    return process.env.LOGO_URL;
  }
  // Return actual logo URL - email clients prefer external URLs
  // This is the live logo URL that should be used in email templates
  return 'https://portal.solitairemarkets.com/logo.png';
};

// Validate required email environment variables
const requiredEmailVars = ['EMAIL_HOST', 'EMAIL_USER', 'EMAIL_PASS'];
const missingVars = requiredEmailVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('[EMAIL CONFIG] Missing required environment variables:', missingVars.join(', '));
  console.error('[EMAIL CONFIG] Email functionality will not work until these are set.');
}

// Function to create transporter with current env vars
const createTransporter = () => {
  const emailHost = process.env.EMAIL_HOST;
  const emailPort = parseInt(process.env.EMAIL_PORT || '587');
  const emailUser = process.env.EMAIL_USER;
  const emailPass = process.env.EMAIL_PASS;
  
  // Validate required variables
  if (!emailHost || !emailUser || !emailPass) {
    throw new Error(`Missing email configuration: EMAIL_HOST=${!!emailHost}, EMAIL_USER=${!!emailUser}, EMAIL_PASS=${!!emailPass}`);
  }
  
  // Trim whitespace from API key (common issue)
  const cleanApiKey = emailPass.trim();
  
  // Validate SendGrid configuration
  if (emailHost.includes('sendgrid')) {
    // CRITICAL: SendGrid requires EMAIL_USER to be "apikey", not the API key name
    if (emailUser !== 'apikey') {
      const errorMsg = `[EMAIL CONFIG] ❌ CRITICAL ERROR: For SendGrid, EMAIL_USER must be "apikey", but it's currently set to "${emailUser}". This will cause authentication failures. Please update your environment variable EMAIL_USER to "apikey".`;
      console.error(errorMsg);
      throw new Error(errorMsg);
    }
    if (!cleanApiKey.startsWith('SG.')) {
      console.warn('[EMAIL CONFIG] ⚠️  WARNING: SendGrid API key should start with "SG." but yours starts with:', cleanApiKey.substring(0, 3));
      console.warn('[EMAIL CONFIG] Make sure you copied the full API key from SendGrid dashboard.');
    }
    if (cleanApiKey.length < 50) {
      console.warn('[EMAIL CONFIG] ⚠️  WARNING: SendGrid API key seems too short. Full keys are usually 69+ characters.');
    }
  }
  
  console.log('[EMAIL CONFIG] Creating transporter:', {
    host: emailHost,
    port: emailPort,
    secure: emailPort === 465,
    user: emailUser,
    passLength: cleanApiKey.length,
    passStartsWith: cleanApiKey.substring(0, 3) + '...',
    passEndsWith: '...' + cleanApiKey.substring(cleanApiKey.length - 3),
    from: process.env.EMAIL_FROM || 'no_reply@solitairemarkets.me'
  });
  
  return nodemailer.createTransport({
    host: emailHost,
    port: emailPort,
    secure: emailPort === 465, // true for 465, false for other ports
    auth: {
      user: emailUser.trim(),
      pass: cleanApiKey,
    },
    // Add connection timeout
    connectionTimeout: 10000, // 10 seconds
    greetingTimeout: 10000,
    socketTimeout: 10000,
    // Add debug option in development
    debug: process.env.NODE_ENV === 'development',
    logger: process.env.NODE_ENV === 'development'
  });
};

// Create transporter on module load
let transporter = null;
try {
  transporter = createTransporter();
  console.log('[EMAIL CONFIG] ✅ Transporter initialized successfully');
  
  // Warn if EMAIL_FROM doesn't match verified sender
  const verifiedSender = 'no_reply@solitairemarkets.me';
  if (process.env.EMAIL_FROM && process.env.EMAIL_FROM !== verifiedSender) {
    console.warn(`[EMAIL CONFIG] ⚠️  WARNING: EMAIL_FROM (${process.env.EMAIL_FROM}) does not match verified sender (${verifiedSender}). Emails may fail.`);
  }
} catch (error) {
  console.error('[EMAIL CONFIG] ❌ Failed to create transporter:', error.message);
  console.error('[EMAIL CONFIG] Please check your .env file and ensure EMAIL_HOST, EMAIL_USER, and EMAIL_PASS are set correctly.');
}

/**
 * Send password reset email
 * @param {string} email - Recipient email
 * @param {string} resetToken - Password reset token
 * @returns {Promise<object>} - Email send result
 */
export const sendPasswordResetEmail = async (email, resetToken) => {
  // Try to use template from unified_actions first
  try {
    const { sendTemplateEmail } = await import('./templateEmail.service.js');
    return await sendTemplateEmail(
      'Forgot Password Email - on Forgot Password',
      email,
      {
        recipientName: 'User',
        resetUrl: `${process.env.FRONTEND_URL || 'https://portal.solitairemarkets.com'}/reset-password?token=${resetToken}`
      },
      'Password Reset Request - Solitaire CRM'
    );
  } catch (templateError) {
    // Fallback to hardcoded email if template not found
    console.warn('Template not found for password reset, using fallback:', templateError.message);
  }

  const frontendUrl = process.env.FRONTEND_URL || 'https://portal.solitairemarkets.com';
  const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}`;
  const logoUrl = getLogoUrl(); // Returns: https://portal.solitairemarkets.com/logo.png

  const mailOptions = {
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
    to: email,
    subject: 'Password Reset Request - Solitaire CRM',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Password Reset</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #f4f4f4; padding: 20px; border-radius: 10px;">
          <div style="text-align: center; margin-bottom: 20px;">
            <img src="${logoUrl}" alt="Solitaire Markets" style="height: 50px; margin-bottom: 10px;" />
            <h2 style="color: #333; margin: 0;">Password Reset Request</h2>
          </div>
          <p>Hello,</p>
          <p>We received a request to reset your password for your Solitaire CRM account.</p>
          <p>Click the button below to reset your password:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" 
               style="background-color: #e6c200; color: #333; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
              Reset Password
            </a>
          </div>
          <p>Or copy and paste this link into your browser:</p>
          <p style="word-break: break-all; color: #666; font-size: 12px;">${resetUrl}</p>
          <p><strong>This link will expire in 1 hour.</strong></p>
          <p>If you didn't request a password reset, please ignore this email. Your password will remain unchanged.</p>
          <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
          <p style="font-size: 12px; color: #666; text-align: center;">
            This is an automated message, please do not reply to this email.
          </p>
        </div>
      </body>
      </html>
    `,
    text: `
      Password Reset Request
      
      Hello,
      
      We received a request to reset your password for your Solitaire CRM account.
      
      Click the following link to reset your password:
      ${resetUrl}
      
      This link will expire in 1 hour.
      
      If you didn't request a password reset, please ignore this email. Your password will remain unchanged.
      
      This is an automated message, please do not reply to this email.
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Password reset email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending email:', error);
    throw new Error('Failed to send password reset email');
  }
};

/**
 * Verify email transporter connection
 */
export const verifyEmailConnection = async () => {
  try {
    await transporter.verify();
    console.log('Email server is ready to send messages');
    return true;
  } catch (error) {
    console.error('Email server connection failed:', error);
    return false;
  }
};


/**
 * Send operation email (Deposit, Withdrawal, Bonus)
 * @param {string} type - Type of operation (deposit, withdrawal, bonus_add, bonus_deduct)
 * @param {object} payload - Data for the email (email, account_login, amount, date, name)
 * @returns {Promise<object>} - Email send result
 */
export const sendOperationEmail = async (type, payload) => {
  try {
    const { email, account_login, amount, date, name } = payload || {};
    if (!email) return { ok: false, error: 'missing email' };

    const safeAmount = typeof amount === 'number' ? amount.toFixed(2) : String(amount || '0');
    const ts = date || new Date().toISOString();
    const logoUrl = getLogoUrl(); // Returns: https://portal.solitairemarkets.com/logo.png
    const subjectMap = {
      deposit: 'Deposit Approved',
      withdrawal: 'Withdrawal Approved',
      bonus_add: 'Bonus Added',
      bonus_deduct: 'Bonus Deducted',
    };
    const title = subjectMap[type] || 'Notification';
    const lineMap = {
      deposit: 'Deposit Approved',
      withdrawal: 'Withdrawal Approved',
      bonus_add: 'Bonus Added',
      bonus_deduct: 'Bonus Deducted',
    };
    const line = lineMap[type] || 'notification';
    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #222; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px; text-align: center; margin-bottom: 20px;">
          <img src="${logoUrl}" alt="Solitaire Markets" style="height: 40px; margin-bottom: 10px;" />
          <h2 style="margin: 0; font-size: 24px;">${line}</h2>
        </div>
        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <p style="margin: 0 0 15px 0; font-size: 16px;">Hi ${name || 'Valued Customer'},</p>
          <div style="background: white; padding: 15px; border-radius: 6px; border-left: 4px solid #667eea;">
            <p style="margin: 5px 0; font-size: 14px;"><strong>MT5:</strong> ${account_login || '-'}</p>
            <p style="margin: 5px 0; font-size: 14px;"><strong>Amount:</strong> ${safeAmount}</p>
            <p style="margin: 5px 0; font-size: 14px;"><strong>Source:</strong> Admin</p>
            <p style="margin: 5px 0; font-size: 14px;"><strong>Date:</strong> ${new Date().toLocaleString()}</p>
          </div>
        </div>
        <p style="font-size: 14px; color: #666;">If you did not authorize this action, please contact support immediately.</p>
        <p style="font-size: 14px; margin-top: 30px;">Regards,<br/><strong>${process.env.EMAIL_FROM_NAME || 'Solitaire Markets'}</strong></p>
      </div>
    `;

    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME || 'Solitaire Markets'}" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
      to: email,
      subject: line,
      text: `${line}\n\nHi ${name || 'Valued Customer'},\n\nMT5: ${account_login || '-'}\nAmount: ${safeAmount}\nSource: Admin\nDate: ${new Date().toLocaleString()}\n\nIf you did not authorize this action, please contact support immediately.\n\nRegards,\n${process.env.EMAIL_FROM_NAME || 'Solitaire Markets'}`,
      html,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Operation email sent:', info.messageId);
    return { ok: true, messageId: info.messageId };
  } catch (e) {
    console.warn('sendOperationEmail failed:', e.message);
    return { ok: false, error: e.message };
  }
};


/**
 * Send a generic email
 * @param {object} options - Email options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.html - HTML content
 * @param {string} options.text - Text content (optional)
 * @param {array} options.attachments - Attachments array (optional)
 * @param {boolean} options.includeLogo - Whether to include logo as attachment (default: true)
 * @returns {Promise<object>} - Email send result
 */
export const sendEmail = async ({ to, subject, html, text, attachments = [], includeLogo = true }) => {
  try {
    // Prepare attachments
    let finalAttachments = [...(attachments || [])];
    let finalHtml = html;
    
    // Ensure logo URL is present in email HTML
    if (includeLogo) {
      const logoUrl = getLogoUrl();
      
      // Check if logo is already present in HTML
      const hasLogo = finalHtml && (
        finalHtml.includes(logoUrl) || 
        /<img[^>]*src[^>]*>/i.test(finalHtml) && (finalHtml.toLowerCase().includes('logo') || finalHtml.toLowerCase().includes('solitaire'))
      );
      
      if (!hasLogo && finalHtml) {
        // No logo found - inject it with the actual URL
        const logoHtml = `<div style="text-align: center; margin: 20px 0; padding: 20px 0;">
          <img src="${logoUrl}" alt="Solitaire Markets" style="height: 60px; max-width: 250px; display: block; margin: 0 auto;" />
        </div>`;
        const bodyMatch = finalHtml.match(/<body[^>]*>/i);
        if (bodyMatch) {
          finalHtml = finalHtml.replace(bodyMatch[0], bodyMatch[0] + logoHtml);
        } else {
          finalHtml = logoHtml + finalHtml;
        }
        console.log('📧 Logo injected with URL:', logoUrl);
      }
      
      // Replace any CID references or base64 logos with actual URL
      if (finalHtml) {
        // Replace CID references with actual URL
        finalHtml = finalHtml.replace(/cid:solitaire-logo/gi, logoUrl);
        
        // Replace any base64 logo URLs with actual URL
        if (LOGO_SVG_BASE64 && finalHtml.includes(LOGO_SVG_BASE64)) {
          const base64Pattern = LOGO_SVG_BASE64.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          finalHtml = finalHtml.replace(new RegExp(base64Pattern, 'g'), logoUrl);
        }
      }
    }
    
    // CRITICAL: Replace all hardcoded wrong URLs with correct dashboard URL
    // This ensures "View Dashboard" links always point to the correct URL
    if (finalHtml) {
      const frontendUrl = process.env.FRONTEND_URL || 'https://portal.solitairemarkets.com';
      const dashboardUrl = `${frontendUrl}/user/dashboard`;
      const supportUrl = `${frontendUrl}/user/support`; // Correct support URL
      
      // Replace any solitairemarkets.me URLs (wrong domain) with correct dashboard URL
      finalHtml = finalHtml.replace(/https?:\/\/solitairemarkets\.me\/[^"'\s>]*/gi, dashboardUrl);
      finalHtml = finalHtml.replace(/https?:\/\/www\.solitairemarkets\.me\/[^"'\s>]*/gi, dashboardUrl);
      
      // Replace any "View Dashboard" or similar links that might have wrong URLs
      finalHtml = finalHtml.replace(/href=["']https?:\/\/solitairemarkets\.me[^"']*["']/gi, `href="${dashboardUrl}"`);
      finalHtml = finalHtml.replace(/href=["']https?:\/\/www\.solitairemarkets\.me[^"']*["']/gi, `href="${dashboardUrl}"`);
      
      // Also replace any localhost URLs that might be in templates
      finalHtml = finalHtml.replace(/href=["']https?:\/\/localhost[^"']*["']/gi, `href="${dashboardUrl}"`);
      
      // Replace any href attributes that contain "dashboard" but have wrong domain
      finalHtml = finalHtml.replace(/href=["']([^"']*solitairemarkets\.me[^"']*dashboard[^"']*)["']/gi, `href="${dashboardUrl}"`);
      
      // CRITICAL: Fix incorrect support URLs (should be /user/support, not /user/dashboard/support)
      finalHtml = finalHtml.replace(/\/user\/dashboard\/support/gi, supportUrl);
      finalHtml = finalHtml.replace(/\/user\/dashboar\/support/gi, supportUrl); // Fix typo "dashboar"
      finalHtml = finalHtml.replace(/\{\{dashboardUrl\}\}\/support/gi, supportUrl);
      
      // Replace any "View Dashboard" text links regardless of URL
      // The dashboard URL will redirect to login if not authenticated, then back to dashboard after login
      finalHtml = finalHtml.replace(/<a[^>]*>[\s]*View[\s]+Dashboard[\s]*<\/a>/gi, `<a href="${dashboardUrl}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; font-weight: 700; font-size: 16px; padding: 16px 40px; border-radius: 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);">View Dashboard</a>`);
      
      // Replace "View Ticket" links to use correct support URL
      finalHtml = finalHtml.replace(/<a[^>]*>[\s]*View[\s]+Ticket[\s]*<\/a>/gi, `<a href="${supportUrl}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; font-weight: 700; font-size: 16px; padding: 16px 40px; border-radius: 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);">View Ticket</a>`);
      finalHtml = finalHtml.replace(/<a[^>]*>[\s]*View[\s]*&[\s]*Reply[\s]+to[\s]+Ticket[\s]*<\/a>/gi, `<a href="${supportUrl}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; font-weight: 700; font-size: 16px; padding: 16px 40px; border-radius: 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);">View & Reply to Ticket</a>`);
    }
    
    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME || 'Solitaire Markets'}" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
      to,
      subject,
      html: finalHtml,
      text: text || finalHtml.replace(/<[^>]*>/g, ''), // Fallback text generation
      attachments: finalAttachments.length > 0 ? finalAttachments : undefined,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Generic email sent:', info.messageId);
    if (finalAttachments.length > 0) {
      console.log(`📧 Email sent with ${finalAttachments.length} attachment(s)`);
    }
    return { ok: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending generic email:', error);
    throw error;
  }
};

/**
 * Send OTP verification email
 * @param {string} email - Recipient email
 * @param {string} otp - 6-digit OTP code
 * @returns {Promise<object>} - Email send result
 */
export const sendOTPEmail = async (email, otp) => {
  // Use verified sender email - must match the verified sender in email service
  // IMPORTANT: The verified sender is no_reply@solitairemarkets.me (with underscore, not hyphen)
  const verifiedSender = 'no_reply@solitairemarkets.me';
  const fromEmail = process.env.EMAIL_FROM || verifiedSender;
  const fromName = process.env.EMAIL_FROM_NAME || 'Solitaire Markets';
  
  // Validate that fromEmail matches verified sender
  if (fromEmail !== verifiedSender) {
    console.warn(`[EMAIL WARNING] From email (${fromEmail}) does not match verified sender (${verifiedSender}). Email may be rejected.`);
  }
  
  // Log configuration for debugging
  console.log('[EMAIL DEBUG] Sending OTP email:', {
    to: email,
    from: `${fromName} <${fromEmail}>`,
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    user: process.env.EMAIL_USER ? '***set***' : 'NOT SET'
  });

  const logoUrl = getLogoUrl(); // Returns: https://portal.solitairemarkets.com/logo.png
  
  const mailOptions = {
    from: `"${fromName}" <${fromEmail}>`,
    to: email,
    subject: 'Verify Your Email - Solitaire Markets',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Email Verification</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #f4f4f4; padding: 30px; border-radius: 10px;">
          <div style="text-align: center; margin-bottom: 20px;">
            <img src="${logoUrl}" alt="Solitaire Markets" style="height: 50px; margin-bottom: 10px;" />
            <h2 style="color: #333; margin: 0;">Email Verification</h2>
          </div>
          <p>Hello,</p>
          <p>Thank you for registering with Solitaire Markets. Please verify your email address by entering the OTP code below:</p>
          <div style="text-align: center; margin: 30px 0;">
            <div style="background-color: #e6c200; color: #333; padding: 20px; border-radius: 8px; display: inline-block; font-size: 32px; font-weight: bold; letter-spacing: 8px; font-family: 'Courier New', monospace;">
              ${otp}
            </div>
          </div>
          <p style="text-align: center; color: #666; font-size: 14px;">This OTP will expire in 10 minutes.</p>
          <p>If you didn't create an account with us, please ignore this email.</p>
          <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
          <p style="font-size: 12px; color: #666; text-align: center;">
            This is an automated message, please do not reply to this email.
          </p>
        </div>
      </body>
      </html>
    `,
    text: `
      Email Verification
      
      Hello,
      
      Thank you for registering with Solitaire Markets. Please verify your email address by entering the OTP code below:
      
      ${otp}
      
      This OTP will expire in 10 minutes.
      
      If you didn't create an account with us, please ignore this email.
      
      This is an automated message, please do not reply to this email.
    `,
  };

  try {
    // Recreate transporter if it doesn't exist (in case env vars were updated)
    if (!transporter) {
      console.log('[EMAIL DEBUG] Transporter not initialized, creating new one...');
      try {
        transporter = createTransporter();
        console.log('[EMAIL DEBUG] ✅ Transporter created successfully');
      } catch (createError) {
        console.error('[EMAIL DEBUG] ❌ Failed to create transporter:', createError.message);
        throw new Error(`Email transporter not initialized: ${createError.message}. Check EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS environment variables.`);
      }
    }
    
    // Double-check transporter is valid
    if (!transporter || typeof transporter.sendMail !== 'function') {
      console.error('[EMAIL DEBUG] ❌ Transporter is invalid, attempting to recreate...');
      try {
        transporter = createTransporter();
      } catch (recreateError) {
        throw new Error(`Email transporter is invalid and cannot be recreated: ${recreateError.message}`);
      }
    }

    // Test connection before sending (but don't fail if verify fails, just log it)
    try {
      await transporter.verify();
      console.log('[EMAIL DEBUG] ✅ SMTP connection verified successfully');
    } catch (verifyError) {
      console.error('[EMAIL DEBUG] ⚠️  SMTP verification failed, but attempting to send anyway:', {
        message: verifyError.message,
        code: verifyError.code,
        command: verifyError.command,
        response: verifyError.response,
        responseCode: verifyError.responseCode
      });
      
      // If it's an auth error, recreate transporter and try again
      if (verifyError.code === 'EAUTH' || verifyError.responseCode === 535) {
        console.log('[EMAIL DEBUG] Auth error detected, recreating transporter with fresh credentials...');
        try {
          transporter = createTransporter();
          // Try verify again
          await transporter.verify();
          console.log('[EMAIL DEBUG] ✅ SMTP connection verified after recreation');
        } catch (retryError) {
          console.error('[EMAIL DEBUG] ❌ Still failing after recreation:', retryError.message);
          throw new Error(`SMTP authentication failed: ${verifyError.message}. Please check EMAIL_USER (should be "apikey" for SendGrid) and EMAIL_PASS (your SendGrid API key).`);
        }
      } else {
        // For non-auth errors, continue anyway (some servers don't support verify)
        console.log('[EMAIL DEBUG] Non-auth error, continuing with send attempt...');
      }
    }

    // Send the email
    let info;
    try {
      info = await transporter.sendMail(mailOptions);
    } catch (sendError) {
      console.error('[EMAIL DEBUG] Error during sendMail:', {
        message: sendError.message,
        code: sendError.code,
        response: sendError.response,
        responseCode: sendError.responseCode
      });
      
      // If send fails with auth error, try recreating transporter once more
      if (sendError.code === 'EAUTH' || sendError.responseCode === 535) {
        console.log('[EMAIL DEBUG] Auth error during send, recreating transporter one more time...');
        try {
          transporter = createTransporter();
          info = await transporter.sendMail(mailOptions);
          console.log('[EMAIL DEBUG] ✅ Email sent successfully after transporter recreation');
        } catch (retrySendError) {
          throw new Error(`SMTP authentication failed: ${sendError.message}. Please check EMAIL_USER (should be "apikey" for SendGrid) and EMAIL_PASS (your SendGrid API key).`);
        }
      } else {
        throw sendError;
      }
    }
    console.log('[EMAIL DEBUG] OTP email sent successfully:', {
      messageId: info.messageId,
      response: info.response,
      accepted: info.accepted,
      rejected: info.rejected
    });

    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('[EMAIL DEBUG] Error sending OTP email:', {
      message: error.message,
      code: error.code,
      command: error.command,
      response: error.response,
      responseCode: error.responseCode,
      stack: error.stack
    });
    
    // Provide more specific error messages
    if (error.code === 'EAUTH' || error.responseCode === 535) {
      const errorMsg = error.response || error.message || '';
      if (errorMsg.includes('Invalid login') || errorMsg.includes('Authentication failed')) {
        throw new Error('Email authentication failed. Your SendGrid API key may be invalid, expired, or revoked. Please check EMAIL_PASS (should be your SendGrid API key) and EMAIL_USER (should be "apikey" for SendGrid).');
      }
      throw new Error('Email authentication failed. Please check EMAIL_USER and EMAIL_PASS. For SendGrid, EMAIL_USER should be "apikey" and EMAIL_PASS should be your API key.');
    } else if (error.code === 'ECONNECTION') {
      throw new Error('Cannot connect to email server. Please check EMAIL_HOST and EMAIL_PORT.');
    } else if (error.code === 'ETIMEDOUT') {
      throw new Error('Email server connection timed out. Please check your network and email server settings.');
    } else if (error.response) {
      throw new Error(`Email server rejected the request: ${error.response}`);
    } else {
      // Log failed email action
      try {
        await logEmailAction({
          actionType: 'otp_verification',
          actionCategory: 'authentication',
          recipientEmail: email,
          emailTemplate: 'otp_verification',
          emailSubject: 'Verify Your Email - Solitaire Markets',
          emailStatus: 'failed',
          emailError: error.message || 'Email send failed',
          description: `Failed to send OTP verification email to ${email}`,
          details: { error: error.message, code: error.code }
        });
      } catch (logError) {
        console.warn('Failed to log failed email action (non-blocking):', logError);
      }

      throw new Error(`Failed to send OTP email: ${error.message}`);
    }
  }
};
